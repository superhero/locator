import fs           from 'node:fs/promises'
import path         from 'node:path'
import Config       from '@superhero/config'
import Log          from '@superhero/log'
import PathResolver from '@superhero/path-resolver'

export default class Locator extends Map
{
  log          = new Log({ label:'[LOCATOR]' })
  pathResolver = new PathResolver()
  config       = new Config(this.pathResolver)
  #locateProxy = new Proxy(() => {},
  {
    set             : (...arg) => this.set(arg[1], arg[2]),
    apply           : (...arg) => this.locate.apply(this, arg[2]),
    get             : (_, key) => this[key]?.bind?.(this) ?? this[key] ?? this.get(key),
    has             : (_, key) => this.has(key),
    deleteProperty  : (_, key) => this.delete(key),
    ownKeys         : (_) => [ ...this.keys() ],
  })

  /**
   * We want the instances of this class to be identified as a function.
   * @returns {string}
   */
  get [Symbol.toStringTag]()
  {
    return 'Function'
  }

  /**
   * The locator is a service locator that can be used to locate services.
   * The constructor is a proxy that makes it possible to use the locator as a
   * function, while still exposing the instance methods described by this class.
   */
  constructor(...args)
  {
    super(...args)
    return this.#locateProxy
  }

  set(serviceName, service)
  {
    this.log.info`loaded ${serviceName}`
    return super.set(serviceName, service)
  }

  delete(serviceName)
  {
    this.log.info`deleted ${serviceName}`
    return super.delete(serviceName)
  }

  /**
   * @param {string} serviceName
   * @returns {*}
   * @throws {E_LOCATOR_LOCATE}
   */
  locate(serviceName)
  {
    if(false === this.has(serviceName))
    {
      const error = new Error(`Service "${serviceName}" has not been loaded`)
      error.code  = 'E_LOCATOR_LOCATE'
      throw error
    }

    return this.get(serviceName)
  }

  /**
   * @param {string} serviceName
   * @param {string} [servicePath] optional
   * 
   * @returns {Object}
   * 
   * @throws {E_LOCATOR_LAZYLOAD}
   */
  async lazyload(serviceName, servicePath)
  {
    if(false === this.has(serviceName))
    {
      try
      {
        await this.#resolveServicePath(servicePath ?? serviceName, serviceName)
      }
      catch(reason)
      {
        const error = new Error(`Could not lazyload service "${serviceName}"`)
        error.code  = 'E_LOCATOR_LAZYLOAD'
        error.cause = reason
        throw error
      }
    }

    return this.get(serviceName)
  }

  /**
   * Loads services from a service map.
   * 
   * @param {string|Array|Object} serviceMap will be normalised to an object
   * 
   * @throws {E_LOCATOR_EAGERLOAD}
   * @throws {E_LOCATOR_INVALID_SERVICE_MAP}
   * @throws {E_LOCATOR_SERVICE_UNRESOLVABLE}
   */
  async eagerload(serviceMap)
  {
    const
      standardizedServiceMap  = this.#normaliseServiceMap(serviceMap),
      expandedServiceMap      = await this.#expandServiceMap(standardizedServiceMap)

    await this.#iterateEagerload(expandedServiceMap)
  }

  async destroy()
  {
    const destroyed = []

    for(const [ name, service ] of this.entries())
    {
      if(false === this.config.find(`destroy/${name}`, true))
      {
        this.log.warn`automatic destroy disabled for ${name}`
      }
      else if('function' === typeof service.destroy)
      {
        destroyed.push((async () => 
        {
          try
          {
            const result = await service.destroy()
            this.log.warn`destroyed ${name}`
            return { name, result }
          }
          catch(reason)
          {
            this.log.warn`failed to destroy ${name}`
            return { name, reason }
          }
        })())
      }
    }

    await this.#validateDestroyed(destroyed)
  }

  async #validateDestroyed(destroyed)
  {
    const rejected = []

    for(const { name, reason } of await Promise.all(destroyed))
    {
      if(reason)
      {
        const error = new Error(`Failed to destroy service: ${name}`)
        error.code  = 'E_LOCATOR_DESTROY_SERVICE'
        error.cause = reason
        rejected.push(error)
      }
    }

    if(rejected.length)
    {
      const error = new Error(`Destroy for ${rejected.length}/${destroyed.length} services was rejected`)
      error.code  = 'E_LOCATOR_DESTROY'
      error.cause = rejected
      throw error
    }
  }

  /**
   * Normalises the service map to an object if it's a string or an array.
   * 
   * @param {string|Array|Object} serviceMap
   * @returns 
   */
  #normaliseServiceMap(serviceMap)
  {
    const serviceMapType = Object.prototype.toString.call(serviceMap)

    switch(serviceMapType)
    {
      case '[object Object]':
      {
        return serviceMap
      }
      case '[object Array]':
      {
        return serviceMap.reduce((accumulator, service) => Object.assign(accumulator, { [service]:true }), {})
      }
      case '[object String]':
      {
        return { [serviceMap]:true }
      }
      default:
      {
        const error = new TypeError('Service map must be of type [object Object], or a string or array that can be normalised to an object')
        error.code  = 'E_LOCATOR_INVALID_SERVICE_MAP'
        error.cause = new TypeError(`Invalid service map type "${serviceMapType}"`)
        throw error
      }
    }
  }

  /**
   * Expands wildcard service names and paths in the service map to individual 
   * service names and paths.
   * 
   * @param {Object} serviceMap 
   * @returns {Object}
   */
  async #expandServiceMap(serviceMap)
  {
    const expandedServiceMap = {}

    for(const [serviceName, servicePath] of Object.entries(serviceMap))
    {
      if(servicePath)
      {
        if(true === servicePath)
        {
          await this.#expandWildcards(expandedServiceMap, serviceName, serviceName)
        }
        else
        {
          await this.#expandWildcards(expandedServiceMap, serviceName, servicePath)
        }
      }
    }

    return expandedServiceMap
  }

  async #expandWildcards(expandedServiceMap, serviceName, servicePath) 
  {
    // resolve the absolute path when a service defines a relative path
    if(servicePath.startsWith('.'))
    {
      const 
        configPath    = 'locator/' + serviceName.replaceAll('/', '\\/'),
        absolutePath  = this.config.findAbsoluteDirPathByConfigEntry(configPath, servicePath)
      
      if('string' === typeof absolutePath)
      {
        servicePath = path.normalize(path.join(absolutePath, servicePath))
      }
      else
      {
        servicePath = path.normalize(path.join(this.pathResolver.basePath, servicePath))
      }
    }

    const
      splitName = serviceName.split('*'),
      splitPath = servicePath.split('*')
  
    if(splitName.length !== splitPath.length) 
    {
      const error = new Error(`Invalid wildcard specification for service name "${serviceName}" path "${servicePath}"`)
      error.code  = 'E_LOCATOR_INVALID_PATH'
      error.cause = `Expecting the wildcard count in the service name and path to be the same amount`
      throw error
    }

    const expandedServiceMapLength = Object.keys(expandedServiceMap).length

    await this.#iterateWildcards(expandedServiceMap, splitName[0], splitPath[0], splitName, splitPath, 0)

    if(Object.keys(expandedServiceMap).length === expandedServiceMapLength)
    {
      const error = new Error(`Could not find any service for "${serviceName}" path "${servicePath}"`)
      error.code  = 'E_LOCATOR_INVALID_PATH'
      throw error
    }
  }

  async #iterateWildcards(expandedServiceMap, partialName, partialPath, splitName, splitPath, depth)
  {
    if (++depth === splitName.length)
    {
      expandedServiceMap[partialName] = partialPath
    }
    else
    {
      for (const dirent of await this.#readDirentsByPath(partialPath, true))
      {
        let currentName, currentPath

        if(dirent.isFile() && depth === splitPath.length - 1)
        {
          if(this.#isInvalidFile(dirent.name, splitPath[depth]))
          {
            continue
          }

          const dirent_name = dirent.name.slice(0, dirent.name.length - splitPath[depth].length)

          currentName = partialName + dirent_name + splitName[depth],
          currentPath = partialPath + dirent.name
        }
        else if(dirent.isDirectory())
        {
          if(splitPath[depth][0] !== path.sep)
          {
            continue
          }

          currentName = partialName + dirent.name + splitName[depth],
          currentPath = partialPath + dirent.name + splitPath[depth]
        }
        else
        {
          // Skip this file if it does not match any expected file or directory.
          continue
        }
  
        await this.#iterateWildcards(expandedServiceMap, currentName, currentPath, splitName, splitPath, depth)
      }
    }
  }

  async #readDirentsByPath(dirpath, withFileTypes)
  {
    try
    {
      return await fs.readdir(dirpath, { withFileTypes })
    }
    catch(reason)
    {
      switch(reason.code)
      {
        case 'ENOENT':
        {
          const error = new TypeError(`Could not find directory "${dirpath}"`)
          error.code  = 'E_LOCATOR_INVALID_PATH'
          error.cause = reason
          throw error
        }
        case 'ENOTDIR':
        {
          const error = new TypeError(`Expecting the path "${dirpath}" to be a directory`)
          error.code  = 'E_LOCATOR_INVALID_PATH'
          error.cause = reason
          throw error
        }
        default:
        {
          throw reason
        }
      }
    }
  }

  #isInvalidFile(filename, expectation)
  {
    // if a file ending is defined
    if(expectation 
    && false === filename.endsWith(expectation))
    {
      // Skip this file if the real file ending does not match the expected file ending.
      return true
    }

    // if no file ending is defined
    if(false === filename.endsWith('.js')
    && false === filename.endsWith('.cjs')
    && false === filename.endsWith('.mjs'))
    {
      // Skip this file if the real file does not have a known javascript file ending.
      return true
    }

    for(const fileEnding of [ 'js', 'mjs', 'cjs' ])
    {
      for(const fileType of [ 'test', 'spec', 'unit', 'int', 'e2e', 'example', 'demo' ])
      {
        // Skip this file if the real file does not have a known javascript file ending.
        if(filename.endsWith(`.${fileType}.${fileEnding}`))
        {
          return true
        }
      }
    }
  }

  async #iterateEagerload(expandedServiceMap, attempt = 1)
  {
    const
      queuedServiceMap          = {},
      resolveServicePathErrors  = []

    for(const [ serviceName, servicePath ] of Object.entries(expandedServiceMap))
    {
      if(this.has(serviceName))
      {
        continue
      }

      try
      {
        await this.#resolveServicePath(servicePath, serviceName)
      }
      catch(reason)
      {
        if('E_LOCATOR_SERVICE_UNRESOLVABLE' === reason.code)
        {
          throw reason
        }

        if('E_LOCATOR_LOCATE' !== reason.cause?.code)
        {
          this.log.warn`failed to load ${serviceName} attempt ${attempt}`
        }

        queuedServiceMap[serviceName] = expandedServiceMap[serviceName]
        resolveServicePathErrors.push(reason)
    
        // If all services have failed to resolve, then it's not possible to solve 
        // the service map through further iterations.
        if(Object.keys(expandedServiceMap).length === resolveServicePathErrors.length)
        {
          const error = new Error(`Could not resolve service map`)
          error.code  = 'E_LOCATOR_EAGERLOAD'
          error.cause = resolveServicePathErrors
          throw error
        }
      }
    }

    if(resolveServicePathErrors.length)
    {
      // If there are still services that have not been resolved, then we need to
      // iterate the eagerload process again because some services may not have been 
      // able to resolve due to unresolved dependencies that now have been resolved.
      await this.#iterateEagerload(queuedServiceMap, ++attempt)
    }
  }

  async #resolveServicePath(servicePath, serviceName)
  {
    const
      resolveFile       = this.#resolveFile.bind(this),
      resolveDirectory  = this.#resolveDirectory.bind(this),
      service           = await this.pathResolver.resolve(servicePath, resolveFile, resolveDirectory)

    if(service)
    {
      this.set(serviceName, service)
    }
    else
    {
      const error = new TypeError(`Could not resolve service named "${serviceName}"`)
      error.code  = 'E_LOCATOR_SERVICE_UNRESOLVABLE'
      error.cause = new TypeError(`Service path "${servicePath}" is unresolvable`)
      throw error
    }
  }

  async #resolveFile(filepath)
  {
    const imported = await import(filepath)
    return this.#resolveLocator(imported)
  }

  async #resolveDirectory(dirpath)
  {
    const files = await this.#readDirentsByPath(dirpath)

    for(const file of [ 'locator.js', 'locator.mjs', 'locator.cjs', 
                        'index.js',   'index.mjs',   'index.cjs' ])
    {
      if(files.includes(file))
      {
        const
          filepath = path.join(dirpath, file),
          imported = await import(filepath)

        return this.#resolveLocator(imported)
      }
    }
  }

  #resolveLocator(imported)
  {
    if('function' === typeof imported.locate)
    {
      // If the locate method is a class, then we throw an error, because it's
      // expected to be a callable function.
      if(Function.prototype.toString.call(imported.locate).startsWith('class'))
      {
        const error = new TypeError('Unresolvable exported "locate" property')
        error.code  = 'E_LOCATOR_UNKNOWN_LOCATOR'
        error.cause = new TypeError('Exported "locate" property is expected to be a callable function')
        throw error
      }

      // If the imported module has an exported locate method, then we assume 
      // that it's a service locator, and we call the locate method with this 
      // locator as argument.
      return imported.locate(this.#locateProxy)
    }

    // If the imported module has a locator property, then we assume that 
    // it's a service locator.
    if(imported.Locator)
    {
      if('function' === typeof imported.Locator.locate)
      {
        // If the imported module has a locator property with a locate method, 
        // then we assume that it's a service locator.
        return imported.Locator.locate(this.#locateProxy)
      }

      if('function' === typeof imported.Locator
      && Function.prototype.toString.call(imported.Locator).startsWith('class')
      && 'function' === typeof imported.Locator.prototype.locate
      && 0 === imported.Locator.length) // constructor argument count
      {
        // If the imported module is a class with a locate method, and with no 
        // expected argumets passed to the constructor, then we assume that it's 
        // a service locator. We instanciate the class, and then call the locate 
        // method on the instance with this locator as the argument.
        const locator = new imported.Locator()
        return locator.locate(this.#locateProxy)
      }

      const error = new TypeError('Unresolvable exported "Locator" property')
      error.code  = 'E_LOCATOR_UNKNOWN_LOCATOR'
      error.cause = new TypeError('Exported "Locator" property is expected to have a "locate" method')
      throw error
    }

    if(imported.default)
    {
      if('function' === typeof imported.default.locate)
      {
        // If the imported default module has a locate method, then we assume that it's
        // a service locator.
        return imported.default.locate(this.#locateProxy)
      }

      // If the imported module can not be resolved as a service locator, and there is 
      // a default scope to the imported module, then we assume that it's the located 
      // instance.
      return imported.default
    }

    const error = new TypeError('Could not resolve locator from imported module')
    error.code  = 'E_LOCATOR_UNKNOWN_LOCATOR'
    throw error
  }
}
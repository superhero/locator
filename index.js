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
  #priority    = new Map
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
    for(const [ name, uses ] of this.#priority.entries())
    {
      if(uses.includes(serviceName))
      {
        const error = new Error(`Cannot delete prioritized service "${serviceName}"`)
        error.code  = 'E_LOCATOR_DELETE'
        error.cause = `Service "${serviceName}" is used by "${name}"`
        throw error
      }
    }

    this.log.info`deleted ${serviceName}`
    this.#priority.delete(serviceName)
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
        const
          path = servicePath ?? serviceName,
          name = serviceName

        await this.#resolveService({ name, path })
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
   * @param {string|Array|Object} serviceMap will be normalized to an object
   * 
   * @throws {E_LOCATOR_EAGERLOAD}
   * @throws {E_LOCATOR_INVALID_SERVICE_MAP}
   * @throws {E_LOCATOR_SERVICE_UNRESOLVABLE}
   */
  async eagerload(serviceMap)
  {
    const
      standardizedServiceMap  = this.#normalizeServiceMap(serviceMap),
      serviceConfigs          = await this.#expandServiceMap(standardizedServiceMap)

    await this.#iterateEagerload(serviceConfigs)
  }

  async destroy()
  {
    const rejected = []

    while(this.size)
    {
      const 
        destroy   = [],
        entries   = [ ...this.entries() ],
        priority  = [ ...this.#priority.values() ].flat(),
        filtered  = entries.filter(([ name ]) => false === priority.includes(name))

      for(const [ name, service ] of filtered)
      {
        if(false === this.config.find(`destroy/${name}`, true))
        {
          this.log.warn`disabled "destroy" for service ${name}`

          this.delete(name)
          this.#priority.delete(name)
        }
        else if('function' === typeof service.destroy)
        {
          destroy.push((async () => 
          {
            try
            {
              const result = await service.destroy()
              this.log.info`destroyed ${name}`
              return { name, result }
            }
            catch(reason)
            {
              this.log.warn`failed to destroy ${name}`
              return { name, reason }
            }
            finally
            {
              this.delete(name)
              this.#priority.delete(name)
            }
          })())
        }
        else
        {
          this.delete(name)
          this.#priority.delete(name)
        }
      }

      for(const { name, reason } of await Promise.all(destroy))
      {
        if(reason)
        {
          const error = new Error(`Failed to destroy service: ${name}`)
          error.code  = 'E_LOCATOR_DESTROY_SERVICE'
          error.cause = reason
          rejected.push(error)
        }
      }
    }

    if(rejected.length)
    {
      const error = new Error(`Destroy for ${rejected.length} services was rejected`)
      error.code  = 'E_LOCATOR_DESTROY'
      error.cause = rejected
      throw error
    }
  }

  /**
   * normalizes the service map to an object if it's a string or an array.
   * 
   * @param {string|Array|Object} serviceMap
   * @returns 
   */
  #normalizeServiceMap(serviceMap)
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
        // TODO: validate that each item in the array is a string
        return serviceMap.reduce((accumulator, service) => Object.assign(accumulator, { [service]:true }), {})
      }
      case '[object String]':
      {
        return { [serviceMap]:true }
      }
      default:
      {
        const error = new TypeError('Service map must be of type [object Object], or a string or array that can be normalized to an object')
        error.code  = 'E_LOCATOR_INVALID_SERVICE_MAP'
        error.cause = new TypeError(`Invalid service map type "${serviceMapType}"`)
        throw error
      }
    }
  }

  #normalizeServiceConf(serviceName, serviceConf)
  {
    const 
      normalized      = { name:serviceName, uses:[] },
      serviceConfType = Object.prototype.toString.call(serviceConf)

    switch(serviceConfType)
    {
      case '[object Boolean]':
      {
        normalized.path = serviceName
        break
      }
      case '[object String]':
      {
        normalized.path = serviceConf
        break
      }
      case '[object Array]':
      {
        normalized.path = serviceName
        for(const uses of serviceConf)
        {
          normalized.uses.push(uses)
        }
        break
      }
      case '[object Object]':
      {
        normalized.path = serviceConf.path ?? serviceName
        normalized.uses = serviceConf.uses ?? []
        break
      }
      default:
      {
        const error = new TypeError(`Invalid service configuration for "${serviceName}"`)
        error.code  = 'E_LOCATOR_INVALID_SERVICE_CONFIG'
        error.cause = new TypeError(`Invalid service configuration type "${serviceConfType}"`)
        throw error
      }
    }

    return normalized
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
    const serviceConfigs = []

    for(const [serviceName, serviceConf] of Object.entries(serviceMap))
    {
      if(serviceConf)
      {
        const serviceConfig = this.#normalizeServiceConf(serviceName, serviceConf)
        serviceConfig.path  = this.#normalizeServicePath(serviceConfig.path)
        await this.#expandServiceWildcards(serviceConfigs, serviceConfig)
      }
    }

    return serviceConfigs
  }

  #normalizeServicePath(servicePath)
  {
    if(servicePath.startsWith('.'))
    {
      const
        configPath    = 'locator/' + servicePath.replaceAll('/', '\\/'),
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

    return servicePath
  }

  async #expandServiceWildcards(serviceConfigs, serviceConf) 
  {
    const
      splitName = serviceConf.name.split('*'),
      splitPath = serviceConf.path.split('*')

    if(splitName.length !== splitPath.length) 
    {
      const error = new Error(`Invalid wildcard specification for service name "${serviceConf.name}" path "${serviceConf.path}"`)
      error.code  = 'E_LOCATOR_INVALID_PATH'
      error.cause = `Expecting the wildcard count in the service name and service path to be the same amount`
      throw error
    }

    const initServiceConfigsLength = serviceConfigs.length
    await this.#expandServiceWildcardsIterater(serviceConfigs, serviceConf.uses, splitName[0], splitPath[0], splitName, splitPath)
    if(serviceConfigs.length === initServiceConfigsLength)
    {
      const error = new Error(`Could not find any service for "${serviceConf.name}" path "${serviceConf.path}"`)
      error.code  = 'E_LOCATOR_INVALID_PATH'
      throw error
    }
  }

  async #expandServiceWildcardsIterater(serviceConfigs, uses, partialName, partialPath, splitName, splitPath, depth = 1)
  {
    if(depth === splitName.length)
    {
      serviceConfigs.push(
      {
        name:partialName,
        path:partialPath,
        uses
      })
    }
    else
    {
      const dirents = await this.#readDirentsByPath(partialPath, true)
      for(const dirent of dirents)
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

        await this.#expandServiceWildcardsIterater(serviceConfigs, uses, currentName, currentPath, splitName, splitPath, depth + 1)
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

  async #iterateEagerload(serviceConfigs, attempt = 1)
  {
    const
      queuedServiceConfigs      = [],
      resolveServicePathErrors  = []

    for(const { name, path, uses } of serviceConfigs)
    {
      if(this.has(name))
      {
        continue
      }

      if(false === uses.every(uses => this.has(uses)))
      {
        continue
      }

      try
      {
        await this.#resolveService({ name, path })
        uses.length && this.#priority.set(name, uses)
      }
      catch(reason)
      {
        if('E_LOCATOR_SERVICE_UNRESOLVABLE' === reason.code)
        {
          throw reason
        }

        if('E_LOCATOR_LOCATE' !== reason.cause?.code)
        {
          this.log.warn`failed to load ${name} attempt ${attempt}`
        }

        queuedServiceConfigs.push({ name, path, uses })
        resolveServicePathErrors.push(reason)
    
        // If all services have failed to resolve, then it's not possible to solve 
        // the service map through further iterations.
        if(serviceConfigs.length === resolveServicePathErrors.length)
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
      await this.#iterateEagerload(queuedServiceConfigs, attempt + 1)
    }
  }

  async #resolveService({ name, path })
  {
    const
      callbackFile  = this.#resolveFile.bind(this),
      callbackDir   = this.#resolveDirectory.bind(this),
      service       = await this.pathResolver.resolve(path, callbackFile, callbackDir)

    if(service)
    {
      this.set(name, service)
    }
    else
    {
      const error = new TypeError(`Could not resolve service named "${name}"`)
      error.code  = 'E_LOCATOR_SERVICE_UNRESOLVABLE'
      error.cause = `Service path "${path}" is unresolvable`
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
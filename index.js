import fs           from 'node:fs/promises'
import path         from 'node:path'
import PathResolver from '@superhero/path-resolver'

export default class Locator extends Map
{
  pathResolver = new PathResolver()
  #locateProxy = new Proxy(() => {},
  {
    set             : (...arg) => this.set(arg[1], arg[2]),
    apply           : (...arg) => this.locate.apply(this, arg[2]),
    get             : (_, key) => this[key]?.bind?.(this) ?? this[key] ?? this.get(key),
    has             : (_, key) => this.has(key),
    deleteProperty  : (_, key) => this.delete(key),
    ownKeys         : (_) => [ ...this.keys() ],
  })

  constructor(...args)
  {
    super(...args)
    return this.#locateProxy
  }

  async bootstrap(serviceMap)
  {
    await this.eagerload(serviceMap)
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

  async destruct()
  {
    const destructions = []

    for(const [ name, service ] of this.entries())
    {
      if('function' === typeof service.destructor)
      {
        destructions.push((async () => 
        {
          try
          {
            const result = await service.destructor()
            return { name, result }
          }
          catch(reason)
          {
            return { name, reason }
          }
        })())
      }
    }

    await this.#validateDestructions(destructions)
  }

  async #validateDestructions(destructions)
  {
    const rejected = []

    for(const { name, reason } of await Promise.all(destructions))
    {
      if(reason)
      {
        const error = new Error(`Destructor for service ${name} failed`)
        error.code  = 'E_LOCATOR_DESTRUCT_SERVICE_DESTRUCTOR'
        error.cause = reason
        rejected.push(error)
      }
    }

    if(rejected.length)
    {
      const error = new Error(`Destructor for ${rejected.length}/${destructions.length} services was rejected`)
      error.code  = 'E_LOCATOR_DESTRUCT'
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
      for (const dirent of await this.#readDirentsByPath(partialPath))
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
          if(splitPath[depth][0] !== '/')
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

  async #readDirentsByPath(path)
  {
    try
    {
      return await fs.readdir(path, { withFileTypes:true })
    }
    catch(reason)
    {
      switch(reason.code)
      {
        case 'ENOENT':
        {
          const error = new TypeError(`Could not find directory "${path}"`)
          error.code  = 'E_LOCATOR_INVALID_PATH'
          error.cause = reason
          throw error
        }
        case 'ENOTDIR':
        {
          const error = new TypeError(`Expecting the path "${path}" to be a directory`)
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
    if(expectation)
    {
      if(false === filename.endsWith(expectation))
      {
        // Skip this file if the real file ending does not match the expected file ending.
        return true
      }
    }
    // if no file ending is defined
    else if(false === filename.endsWith('.js')
         && false === filename.endsWith('.cjs')
         && false === filename.endsWith('.mjs'))
    {
      // Skip this file if the real file does not have a known javascript file ending.
      return true
    }
  }

  async #iterateEagerload(expandedServiceMap)
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
      await this.#iterateEagerload(queuedServiceMap)
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
    const files = await fs.readdir(dirpath)

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

  get [Symbol.toStringTag]()
  {
    return 'Function'
  }
}
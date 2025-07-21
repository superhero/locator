import fs   from 'node:fs/promises'
import path from 'node:path'

/**
 * @module @superhero/locator/loader
 */
export default class Loader
{
  #log
  #config
  #pathResolver
  #priority
  #locator

  /**
   * @param {@superhero/log} log - The log instance of the locator.
   * @param {@superhero/config} config - The config instance of the locator.
   * @param {@superhero/path-resolver} pathResolver - The path resolver instance of the locator.
   * @param {Map} priority - The priority map of the locator.
   * @param {@superhero/locator} locator - The locator proxy.
   */
  constructor(log, config, pathResolver, priority, locator)
  {
    this.#log           = log
    this.#config        = config
    this.#pathResolver  = pathResolver
    this.#priority      = priority
    this.#locator       = locator
  }

  /**
   * @param {string} serviceName
   * @param {string} [servicePath] optional
   * 
   * @returns {Object}
   * 
   * @throws {E_LOCATOR_LAZYLOAD}
   */
  async lazy(serviceName, servicePath)
  {
    if(false === this.#locator.has(serviceName))
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

    return this.#locator.get(serviceName)
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
  async eager(serviceMap)
  {
    const
      standardizedServiceMap  = this.#normalizeServiceMap(serviceMap),
      serviceConfigs          = await this.#expandServiceMap(standardizedServiceMap)

    await this.#iterateEagerload(serviceConfigs)
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

  async #iterateEagerload(serviceConfigs, attempt = 1)
  {
    const
      queuedServiceConfigs      = [],
      resolveServicePathErrors  = []

    for(const { name, path, uses } of serviceConfigs)
    {
      if(this.#locator.has(name))
      {
        continue
      }

      try
      {
        // If the service has declared it is using other services, then we check to see if those
        // services have already been loaded. If not, then we throw a "locator priority error" and 
        // continue to the next service without attempting to load this service.
        for(const using of uses)
        {
          if(false === this.#locator.has(using))
          {
            const error = new Error(`Service "${name}" is using "${using}" which has not yet been loaded`)
            error.code  = 'E_LOCATOR_SERVICE_PRIORITY'
            throw error
          }
        }

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
          this.#log.warn`failed to load ${name} attempt ${attempt}`
        }

        queuedServiceConfigs.push({ name, path, uses })
        resolveServicePathErrors.push(reason)
      }
    }

    // If all services have failed to resolve, then it's not possible to solve 
    // the service map through further iterations.
    if(resolveServicePathErrors.length 
    && resolveServicePathErrors.length === serviceConfigs.length)
    {
      const error = new Error(`Could not resolve service map`)
      error.code  = 'E_LOCATOR_EAGERLOAD'
      error.cause = resolveServicePathErrors
      throw error
    }

    // If we have tried to resolve the service map more than 1000 times (hardcoded unreasnable 
    // large number), then we throw an error, because it doesn't seem to be possible to 
    // resolve the service map.
    // This is a safety measure to prevent infinite loops....
    if(attempt >= 1e3)
    {
      const error = new Error(`Could not resolve service map after ${attempt} attempts`)
      error.code  = 'E_LOCATOR_EAGERLOAD'
      error.cause = resolveServicePathErrors
      throw error
    }

    // If there are still services that have not been resolved, then we need to
    // iterate the eagerload process again because some services may not have been
    // able to resolve due to unresolved dependencies that now have been resolved.
    // We do this until all services have been resolved...
    if(queuedServiceConfigs.length)
    {
      // If there are still services that have not been resolved, then we need to
      // iterate the eagerload process again because some services may not have been 
      // able to resolve due to unresolved dependencies that now have been resolved.
      await this.#iterateEagerload(queuedServiceConfigs, attempt + 1)
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
        serviceConfig.path  = this.#normalizeServicePath(serviceConfig.name, serviceConfig.path)
        await this.#expandServiceWildcards(serviceConfigs, serviceConfig)
      }
    }

    return serviceConfigs
  }

  #normalizeServicePath(serviceName, servicePath)
  {
    if(servicePath.startsWith('.'))
    {
      const
        configPath    = 'locator/' + serviceName.replaceAll('/', '\\/'),
        absolutePath  = this.#config.findAbsolutePathByConfigPath(configPath)
      
      if('string' === typeof absolutePath)
      {
        servicePath = path.normalize(path.join(path.dirname(absolutePath), servicePath))
      }
      else
      {
        servicePath = path.normalize(path.join(this.#pathResolver.basePath, servicePath))
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

  async #resolveService({ name, path })
  {
    const
      callbackFile  = this.#resolveFile.bind(this),
      callbackDir   = this.#resolveDirectory.bind(this),
      service       = await this.#pathResolver.resolve(path, callbackFile, callbackDir)

    if(service)
    {
      this.#locator.set(name, service)
    }
    else
    {
      const error = new TypeError(`Could not resolve service named "${name}"`)
      error.code  = 'E_LOCATOR_SERVICE_UNRESOLVABLE'
      error.cause = `Service path "${path}" is unresolvable`
      throw error
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
  
  async #resolveFile(filepath)
  {
    const imported = await import(filepath)
    return await this.#resolveLocator(imported)
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

        return await this.#resolveLocator(imported)
      }
    }
  }

  async #resolveLocator(imported)
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
      return await imported.locate(this.#locator)
    }

    // If the imported module has a locator property, then we assume that 
    // it's a service locator.
    if(imported.Locator)
    {
      if('function' === typeof imported.Locator.locate)
      {
        // If the imported module has a locator property with a locate method, 
        // then we assume that it's a service locator.
        return await imported.Locator.locate(this.#locator)
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
        return await locator.locate(this.#locator)
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
        return await imported.default.locate(this.#locator)
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
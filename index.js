import Config       from '@superhero/config'
import Log          from '@superhero/log'
import PathResolver from '@superhero/path-resolver'
import Loader       from '#loader'

export default class Locator extends Map
{
  #loader
  log           = new Log({ label:'[LOCATOR]' })
  pathResolver  = new PathResolver()
  config        = new Config(this.pathResolver)
  #priority     = new Map()

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

    const proxy = new Proxy(() => {},
    {
      set             : (...arg) => this.set(arg[1], arg[2]),
      apply           : (...arg) => this.locate.apply(this, arg[2]),
      get             : (_, key) => this[key]?.bind?.(this) ?? this[key] ?? this.get(key),
      has             : (_, key) => this.has(key),
      deleteProperty  : (_, key) => this.delete(key),
      ownKeys         : (_) => [ ...this.keys() ],
    })

    this.#loader = new Loader(this.log, this.config, this.pathResolver,
                              this.#priority, proxy)

    return proxy
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
    return await this.#loader.lazy(serviceName, servicePath)
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
    await this.#loader.eager(serviceMap)
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
}
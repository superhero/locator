import assert       from 'node:assert'
import fs           from 'node:fs/promises'
import Locate       from '@superhero/locator'
import { before, after, suite, test, afterEach } from 'node:test'

suite('@superhero/locator', () => 
{
  const
    testDir                 = './test',
    servicesDir             = `${testDir}/services`,
    serviceFileA            = `${servicesDir}/serviceA.js`,
    serviceFileB            = `${servicesDir}/serviceB.js`,
    nonStandardFile         = `${servicesDir}/serviceC.xy`,
    nestedServiceDir        = `${servicesDir}/nested`,
    nestedServiceFile       = `${nestedServiceDir}/service.js`,
    locatorsDir             = `${testDir}/locators`,
    locatorFile             = `${locatorsDir}/locator.js`,
    exportedLocateFunction  = `${locatorsDir}/example-exported-locate.js`,
    exportedLocatorClass    = `${locatorsDir}/example-exported-locator.js`,
    selfLocator             = `${locatorsDir}/example-self-locator.js`,
    destroyDir              = `${testDir}/destroyers`,
    destroyFileSuccess      = `${destroyDir}/success.js`,
    destroyFileFailing      = `${destroyDir}/failing.js`

  let locate

  before(async () =>
  {
    locate = new Locate()
    locate.log.config.mute = true

    await fs.mkdir(nestedServiceDir,  { recursive: true })
    await fs.mkdir(locatorsDir,       { recursive: true })
    await fs.mkdir(destroyDir,        { recursive: true })

    // Create mock service files
    await fs.writeFile(serviceFileA,            'export default {}')
    await fs.writeFile(serviceFileB,            'export default {}')
    await fs.writeFile(nonStandardFile,         'export default {}')
    await fs.writeFile(nestedServiceFile,       'export default {}')
    await fs.writeFile(locatorFile,             'export default { locate: (locate) => locate("some-service") }')
    await fs.writeFile(selfLocator,             'export default class Foo { static locate(locate) { return new Foo(locate("some-service")) } constructor(service) { this.service = service } }')
    await fs.writeFile(exportedLocatorClass,    'export class Locator { locate(locate) { return locate("some-service") } }')
    await fs.writeFile(exportedLocateFunction,  'export function locate(locate) { return locate("some-service") }')
    await fs.writeFile(destroyFileSuccess,      'export default new class { destroy() { this.destroyed = true } }')
    await fs.writeFile(destroyFileFailing,      'export default new class { destroy() { throw new Error("Failed to destroy") } }')
  })

  after(async () => 
  {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  afterEach(() => locate.clear())

  suite('Lazyload', () =>
  {
    test('Lazyload a service', async () => 
    {
      const service = await locate.lazyload('service', serviceFileA)
      assert.ok(service, 'Should have lazy loaded the service')
    })
  
    test('Lazyload same service multiple times', async () => 
    {
      const foo = await locate.lazyload(serviceFileA)
      assert.ok(foo, 'Should have lazy loaded the service')
  
      const bar = await locate.lazyload(serviceFileA)
      assert.ok(bar, 'Should still be able to lazy load the service')
    })
  })

  suite('Eagerload', () =>
  {
    test('Eagerload a service', async () => 
    {
      await locate.eagerload(serviceFileA)
      assert.ok(locate(serviceFileA), 'Should be able to locate the service')
    })

    test('Eagerload the same service multiple times', async () => 
    {
      await locate.eagerload(serviceFileA)
      assert.ok(locate(serviceFileA), 'Should be able to locate the service')
  
      await locate.eagerload(serviceFileA)
      assert.ok(locate(serviceFileA), 'Should still be able to locate the service')
    })
  
    test('Eagerload multiple services by a collection definition', async () => 
    {
      const services = [ serviceFileA, serviceFileB ]
  
      await locate.eagerload(services)
  
      assert.ok(locate(serviceFileA), 'Should be able to locate serviceFileA')
      assert.ok(locate(serviceFileB), 'Should be able to locate serviceFileB')
    })

    test('Multiple services by a service path map', async () => 
    {
      const serviceMap =
      {
        'serviceA': serviceFileA,
        'serviceB': serviceFileB,
      }
  
      await locate.eagerload(serviceMap)
  
      assert.ok(locate('serviceA'), 'Should be able to locate serviceA')
      assert.ok(locate('serviceB'), 'Should be able to locate serviceB')
    })
  
    test('Nested wildcard service', async () => 
    {
      const serviceMap = { '*/*/*': testDir + '/*/*/*.js' }
      await locate.eagerload(serviceMap)
      assert.ok(locate('services/nested/service'), 'Should be able to locate the nested service')
    })
  
    test('Specific file by a wildcard service path map', async () => 
    {
      const serviceMap = { 'foobar/*': servicesDir + '/*' }
      await locate.eagerload(serviceMap)
      assert.ok(locate('foobar/serviceA.js'), 'Should be able to locate by the specific file name')
    })

    suite('Using a locator', () =>
    {
      test('Locator file', async () => 
      {
        const serviceMap =
        { 
          'some-service'                  : serviceFileA,
          'locator-located-some-service'  : locatorsDir,
        }
    
        await locate.eagerload(serviceMap)
    
        assert.ok(locate('some-service'),                  'Should have loaded some-service')
        assert.ok(locate('locator-located-some-service'),  'Should have loaded located-some-service')
    
        assert.strictEqual(
          locate.get('some-service'), 
          locate.get('locator-located-some-service'), 
          'Should have loaded the same service')
      })
  
      test('Exported locate function', async () => 
      {
        const serviceMap =
        {
          'some-service'                  : `${serviceFileA}`,
          'locator-located-some-service'  : `${exportedLocateFunction}`,
        }
    
        await locate.eagerload(serviceMap)
    
        assert.ok(locate('some-service'),                  'Should have loaded some-service')
        assert.ok(locate('locator-located-some-service'),  'Should have loaded locator-located-some-service')
    
        assert.strictEqual(
          locate.get('some-service'), 
          locate.get('locator-located-some-service'), 
          'Should have loaded the same service')
      })
  
      test('Exported locator class', async () => 
      {
        const serviceMap =
        {
          'some-service'                  : `${serviceFileA}`,
          'locator-located-some-service'  : `${exportedLocatorClass}`,
        }
    
        await locate.eagerload(serviceMap)
    
        assert.ok(locate('some-service'),                  'Should have loaded some-service')
        assert.ok(locate('locator-located-some-service'),  'Should have loaded located-some-service')
    
        assert.strictEqual(
          locate.get('some-service'), 
          locate.get('locator-located-some-service'), 
          'Should have loaded the same service')
      })
  
      test('Static self locator', async () => 
      {
        const serviceMap =
        {
          'some-service'                  : `${serviceFileA}`,
          'locator-located-some-service'  : `${selfLocator}`,
        }
  
        await locate.eagerload(serviceMap)
  
        assert.ok(locate('some-service'),                  'Should have loaded some-service')
        assert.ok(locate('locator-located-some-service'),  'Should have loaded locator-located-some-service')
  
        assert.strictEqual(
          locate.get('some-service'),
          locate.get('locator-located-some-service').service, 
          'Should have injected some-service in the locator located service')
      })
  
      test('When the dependent service is loaded after the located service', async () => 
      {
        const serviceMap =
        {
          'locator-located-some-service'  : `${exportedLocatorClass}`,
          'some-service'                  : `${serviceFileA}`,
        }
    
        await locate.eagerload(serviceMap)
    
        assert.ok(locate('locator-located-some-service'),  'Should have loaded locator-located-some-service')
        assert.ok(locate('some-service'),                  'Should have loaded some-service')
    
        assert.strictEqual(
          locate.get('some-service'), 
          locate.get('locator-located-some-service'), 
          'Should have loaded the same service')
      })
    })
  })

  suite('Rejects', () =>
  {
    test('Lazyload a nonexistent path', async () => 
    {
      await assert.rejects(
        locate.lazyload('/nonexistent/path'),
        (error) => error.code === 'E_LOCATOR_LAZYLOAD',
        'Should reject with a lazyload error')
    })
  
    test('Lazyload a nonexistent path', async () => 
    {
      await assert.rejects(
        locate.eagerload('/nonexistent/path'),
        (error) => error.code === 'E_LOCATOR_EAGERLOAD',
        'Should reject with a eagerload error')
    })
  
    test('Directory path with no index or locator file', async () =>
    {
      await assert.rejects(
        locate.eagerload(servicesDir),
        (error) => error.code === 'E_LOCATOR_SERVICE_UNRESOLVABLE',
        'Should reject with an unresolvable error')
    })
  
    test('Invalid wildcard path', async () => 
    {
      await assert.rejects(
        locate.eagerload(`${servicesDir}/*invalid`),
        (error) => error.code === 'E_LOCATOR_INVALID_PATH',
        'Should reject with an invalid wildcard error')
    })
  
    test('File path is used as a directory path', async () => 
    {
      await assert.rejects(
        locate.eagerload(`${servicesDir}/serviceA.js/*.js`),
        (error) => error.code === 'E_LOCATOR_INVALID_PATH',
        'Should reject with an error for attempting to load a file path as a directory path')
    })
  
    test('Missmatched wildcard count', async () => 
    {
      const invalidMap = { 'service/*/invalid/*': `${servicesDir}/*/invalid` }
  
      await assert.rejects(
        locate.eagerload(invalidMap),
        (error) => error.code === 'E_LOCATOR_INVALID_PATH',
        'Should reject with a mismatched wildcards count error')
    })
  
    test('Invalid service map types', async () => 
    {
      const invalidServicePaths = [ 123, true, null, undefined, () => {} ]
    
      for (const invalidServicePath of invalidServicePaths) 
      {
        await assert.rejects(
          () => locate.eagerload(invalidServicePath),
          (error) => error.code === 'E_LOCATOR_INVALID_SERVICE_MAP',
          `Should reject with a service map error for type ${typeof invalidServicePath}`)
      }
    })
  
    test('Noneexisting path', async () => 
    {
      const serviceMap = { 'service/*': `${servicesDir}/nonexistent/*` }
    
      await assert.rejects(
        locate.eagerload(serviceMap),
        (error) => error.code === 'E_LOCATOR_INVALID_PATH',
        'Should reject when attempting to read a nonexisting path')
    })
  
    test('Invalid wildcard path', async () => 
    {
      const invalidMap = { 'service*invalid': `${servicesDir}/*invalid` }
  
      await assert.rejects(
        locate.eagerload(invalidMap),
        (error) => error.code === 'E_LOCATOR_INVALID_PATH',
        'Should throw an error for invalid path')
    })
  
    test('Throws error for attempting to locate a nonexisting service', () =>
    {
      assert.throws(
        () => locate('nonexistentService'),
        (error) => error.code === 'E_LOCATOR_LOCATE',
        'Should throw a locate error')
    })
  })

  suite('Destroy', () =>
  {
    test('Successfully destroys a service', async () => 
    {
      const service = await locate.lazyload(destroyFileSuccess)
      await locate.destroy()
      assert.ok(service.destroyed, 'Should have destroyed the service')
    })
  
    test('Throws if fails to destroy a service', async () => 
    {
      await locate.eagerload(destroyFileFailing)
      await assert.rejects(
        () => locate.destroy(),
        (error) => error.code === 'E_LOCATOR_DESTROY',
        'Should reject with a destroy error')
    })
  })

  test('Locate using the locator method', async () => 
  {
    const locator = new Locate()
    locator.log.config.mute = true
    await locator.eagerload({'service': serviceFileA})
    assert.ok(locator.locate('service'), 'Should be able to locate loaded service')
  })
})

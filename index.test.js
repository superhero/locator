import assert     from 'node:assert'
import path       from 'node:path'
import fs         from 'node:fs/promises'
import Locator    from '@superhero/locator'
import { Locate } from '@superhero/locator'
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
    selfLocator             = `${locatorsDir}/example-self-locator.js`

  let locator

  before(async () =>
  {
    locator = new Locator()

    await fs.mkdir(nestedServiceDir,  { recursive: true })
    await fs.mkdir(locatorsDir,       { recursive: true })

    // Create mock service files
    await fs.writeFile(serviceFileA,            'export default {}')
    await fs.writeFile(serviceFileB,            'export default {}')
    await fs.writeFile(nonStandardFile,         'export default {}')
    await fs.writeFile(nestedServiceFile,       'export default {}')
    await fs.writeFile(locatorFile,             'export default { locate: (locator) => locator.locate("some-service") }')
    await fs.writeFile(selfLocator,             'export default class Foo { static locate(locator) { return new Foo(locator.locate("some-service")) } constructor(service) { this.service = service } }')
    await fs.writeFile(exportedLocatorClass,    'export class Locator { locate(locator) { return locator.locate("some-service") } }')
    await fs.writeFile(exportedLocateFunction,  'export function locate(locator) { return locator.locate("some-service") }')
  })

  after(async () => 
  {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  afterEach(() => locator.clear())

  suite('Lazyload', () =>
  {
    test('Lazyload a service', async () => 
    {
      const service = await locator.lazyload('service', serviceFileA)
      assert.ok(service, 'Should have lazy loaded the service')
    })
  
    test('Lazyload same service multiple times', async () => 
    {
      const foo = await locator.lazyload(serviceFileA)
      assert.ok(foo, 'Should have lazy loaded the service')
  
      const bar = await locator.lazyload(serviceFileA)
      assert.ok(bar, 'Should still be able to lazy load the service')
    })
  })

  suite('Eagerload', () =>
  {
    test('Eagerload a service', async () => 
    {
      await locator.eagerload(serviceFileA)
      assert.ok(locator.locate(serviceFileA), 'Should be able to locate the service')
    })

    test('Eagerload the same service multiple times', async () => 
    {
      await locator.eagerload(serviceFileA)
      assert.ok(locator.locate(serviceFileA), 'Should be able to locate the service')
  
      await locator.eagerload(serviceFileA)
      assert.ok(locator.locate(serviceFileA), 'Should still be able to locate the service')
    })
  
    test('Eagerload multiple services by a collection definition', async () => 
    {
      const services = [ serviceFileA, serviceFileB ]
  
      await locator.eagerload(services)
  
      assert.ok(locator.locate(serviceFileA), 'Should be able to locate serviceFileA')
      assert.ok(locator.locate(serviceFileB), 'Should be able to locate serviceFileB')
    })
  
    test('Eagerload through the bootstrap method', async () => 
    {
      const serviceMap =
      {
        'serviceA': serviceFileA,
        'serviceB': serviceFileB,
      }
  
      await locator.bootstrap(serviceMap)
  
      assert.ok(locator.locate('serviceA'), 'Should be able to locate serviceA')
      assert.ok(locator.locate('serviceB'), 'Should be able to locate serviceB')
    })

    test('Multiple services by a service path map', async () => 
    {
      const serviceMap =
      {
        'serviceA': serviceFileA,
        'serviceB': serviceFileB,
      }
  
      await locator.eagerload(serviceMap)
  
      assert.ok(locator.locate('serviceA'), 'Should be able to locate serviceA')
      assert.ok(locator.locate('serviceB'), 'Should be able to locate serviceB')
    })
  
    test('Nested wildcard service', async () => 
    {
      const serviceMap = { '*/*/*': testDir + '/*/*/*.js' }
      await locator.eagerload(serviceMap)
      assert.ok(locator.locate('services/nested/service'), 'Should be able to locate the nested service')
    })
  
    test('Specific file by a wildcard service path map', async () => 
    {
      const serviceMap = { 'foobar/*': servicesDir + '/*' }
      await locator.eagerload(serviceMap)
      assert.ok(locator.locate('foobar/serviceA.js'), 'Should be able to locate by the specific file name')
    })

    suite('Using a locator', () =>
    {
      test('Locator file', async () => 
      {
        const serviceMap =
        { 
          'some-service'                  : `${serviceFileA}`,
          'locator-located-some-service'  : `${locatorsDir}`,
        }
    
        await locator.eagerload(serviceMap)
    
        assert.ok(locator.locate('some-service'),                  'Should have loaded some-service')
        assert.ok(locator.locate('locator-located-some-service'),  'Should have loaded located-some-service')
    
        assert.strictEqual(
          locator.get('some-service'), 
          locator.get('locator-located-some-service'), 
          'Should have loaded the same service')
      })
  
      test('Exported locate function', async () => 
      {
        const serviceMap =
        {
          'some-service'                  : `${serviceFileA}`,
          'locator-located-some-service'  : `${exportedLocateFunction}`,
        }
    
        await locator.eagerload(serviceMap)
    
        assert.ok(locator.locate('some-service'),                  'Should have loaded some-service')
        assert.ok(locator.locate('locator-located-some-service'),  'Should have loaded locator-located-some-service')
    
        assert.strictEqual(
          locator.get('some-service'), 
          locator.get('locator-located-some-service'), 
          'Should have loaded the same service')
      })
  
      test('Exported locator class', async () => 
      {
        const serviceMap =
        {
          'some-service'                  : `${serviceFileA}`,
          'locator-located-some-service'  : `${exportedLocatorClass}`,
        }
    
        await locator.eagerload(serviceMap)
    
        assert.ok(locator.locate('some-service'),                  'Should have loaded some-service')
        assert.ok(locator.locate('locator-located-some-service'),  'Should have loaded located-some-service')
    
        assert.strictEqual(
          locator.get('some-service'), 
          locator.get('locator-located-some-service'), 
          'Should have loaded the same service')
      })
  
      test('Static self locator', async () => 
      {
        const serviceMap =
        {
          'some-service'                  : `${serviceFileA}`,
          'locator-located-some-service'  : `${selfLocator}`,
        }
  
        await locator.eagerload(serviceMap)
  
        assert.ok(locator.locate('some-service'),                  'Should have loaded some-service')
        assert.ok(locator.locate('locator-located-some-service'),  'Should have loaded locator-located-some-service')
  
        assert.strictEqual(
          locator.get('some-service'),
          locator.get('locator-located-some-service').service, 
          'Should have injected some-service in the locator located service')
      })
  
      test('When the dependent service is loaded after the located service', async () => 
      {
        const serviceMap =
        {
          'locator-located-some-service'  : `${exportedLocatorClass}`,
          'some-service'                  : `${serviceFileA}`,
        }
    
        await locator.eagerload(serviceMap)
    
        assert.ok(locator.locate('locator-located-some-service'),  'Should have loaded locator-located-some-service')
        assert.ok(locator.locate('some-service'),                  'Should have loaded some-service')
    
        assert.strictEqual(
          locator.get('some-service'), 
          locator.get('locator-located-some-service'), 
          'Should have loaded the same service')
      })
    })
  })

  suite('Rejects', () =>
  {
    test('Lazyload a nonexistent path', async () => 
    {
      await assert.rejects(
        locator.lazyload('/nonexistent/path'),
        (error) => error.code === 'E_LOCATOR_LAZYLOAD',
        'Should reject with a lazyload error')
    })
  
    test('Lazyload a nonexistent path', async () => 
    {
      await assert.rejects(
        locator.eagerload('/nonexistent/path'),
        (error) => error.code === 'E_LOCATOR_EAGERLOAD',
        'Should reject with a eagerload error')
    })
  
    test('Directory path with no index or locator file', async () =>
    {
      await assert.rejects(
        locator.eagerload(servicesDir),
        (error) => error.code === 'E_LOCATOR_SERVICE_UNRESOLVABLE',
        'Should reject with an unresolvable error')
    })
  
    test('Invalid wildcard path', async () => 
    {
      await assert.rejects(
        locator.eagerload(`${servicesDir}/*invalid`),
        (error) => error.code === 'E_LOCATOR_INVALID_PATH',
        'Should reject with an invalid wildcard error')
    })
  
    test('File path is used as a directory path', async () => 
    {
      await assert.rejects(
        locator.eagerload(`${servicesDir}/serviceA.js/*.js`),
        (error) => error.code === 'E_LOCATOR_INVALID_PATH',
        'Should reject with an error for attempting to load a file path as a directory path')
    })
  
    test('Missmatched wildcard count', async () => 
    {
      const invalidMap = { 'service/*/invalid/*': `${servicesDir}/*/invalid` }
  
      await assert.rejects(
        locator.eagerload(invalidMap),
        (error) => error.code === 'E_LOCATOR_INVALID_PATH',
        'Should reject with a mismatched wildcards count error')
    })
  
    test('Invalid service map types', async () => 
    {
      const invalidServicePaths = [ 123, true, null, undefined, () => {} ]
    
      for (const invalidServicePath of invalidServicePaths) 
      {
        await assert.rejects(
          () => locator.eagerload(invalidServicePath),
          (error) => error.code === 'E_LOCATOR_INVALID_SERVICE_MAP',
          `Should reject with a service map error for type ${typeof invalidServicePath}`)
      }
    })
  
    test('Noneexisting path', async () => 
    {
      const serviceMap = { 'service/*': `${servicesDir}/nonexistent/*` }
    
      await assert.rejects(
        locator.eagerload(serviceMap),
        (error) => error.code === 'E_LOCATOR_INVALID_PATH',
        'Should reject when attempting to read a nonexisting path')
    })
  
    test('Invalid wildcard path', async () => 
    {
      const invalidMap = { 'service*invalid': `${servicesDir}/*invalid` }
  
      await assert.rejects(
        locator.eagerload(invalidMap),
        (error) => error.code === 'E_LOCATOR_INVALID_PATH',
        'Should throw an error for invalid path')
    })
  
    test('Throws error for attempting to locate a nonexisting service', () =>
    {
      assert.throws(
        () => locator.locate('nonexistentService'),
        (error) => error.code === 'E_LOCATOR_LOCATE',
        'Should throw a locate error')
    })
  })

  test('Locate using the locator as the locate method', async () => 
  {
    const locate = new Locate()
    await locate.eagerload({ 'service': serviceFileA })
    assert.ok(locate('service'), 'Should be able to locate loaded services')
  })
})

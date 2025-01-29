
# Locator

A Node.js service locator module, designed to manage dependency injections for services, using an eager or lazy loading approach. This module simplifies service management by dynamically resolving and loading services and their dependencies, supporting wildcard service path maps and agile service resolution methods.

## Features

- **Eager Loading**: Preload services in bulk for faster access, normally done at bootstrap by an application core process.
- **Lazy Loading**: Dynamically load services when they are required, and keep them accessible.
- **Wildcard Service Paths**: Resolve services using wildcard paths, to ease the service registry.
- **Locator**: Locate a service using different implementation alternatives.
- **Destroy**: Support for a graceful release of services resources.
- **Error Handling**: Provides detailed errors with specific error codes for different types of errors.

## Installation

Install the module using npm:

```bash
npm install @superhero/locator
```

## Usage

### Importing the Locator

```javascript
import locator from '@superhero/locator';
```

### Lazyload a Service

```javascript
const foobar1 = await locator.lazyload('foobar', './service.js');
const foobar2 = locator.locate('foobar');
// foobar1 === foobar2
```

### Eagerload Services

```javascript
await locator.eagerload(
{
  serviceA: './services/serviceA.js',
  serviceB: './services/serviceB.js',
});
const serviceA = locator.locate('serviceA');
const serviceB = locator('serviceB'); // optional interface to locate
```

### Using a Wildcard Service Path

```javascript
await locator.eagerload({ 'services/*': './services/*.js' });
const serviceA = locator.locate('services/serviceA');
const serviceB = locator.locate('services/serviceB');
```

### Using Locators

Create custom locators to manage complex dependency trees.

#### Example: Exported `locate` Function

```javascript
export function locate(locator) 
{
  return { foobar: locator.locate('foobar') };
}
```

#### Example: Locator Class

```javascript
export class Locator 
{
  locate(locator) 
  {
    return { foobar: locator.locate('foobar') };
  }
}
```

#### Example: Static Class `locate` Function

```javascript
export default class Foo 
{
  constructor(foobar) 
  {
    this.foobar = foobar;
  }

  static locate(locator) 
  {
    return new Foo(locator.locate('foobar'));
  }
}
```

### Destroy

Services can include a `destroy` method to clean up resources during shutdown or unloading. The locator will automatically call the `destroy` method for all services when the `destroy` method is invoked on the service locator.

#### Example: Using Destroy

Define a service with a `destroy` method:

```javascript
export default new class 
{
  destroy() 
  {
    console.log('Service is being destroyed.');
  }
}
```

Destroy all loaded services:

```javascript
await locator.eagerload(
{
  serviceA: './services/serviceA.js',
  serviceB: './services/serviceB.js',
});

await locator.destroy();
```

#### Error Handling During Destroy

If a service's `destroy` method throws an error, the locator will aggregate these errors and throw a comprehensive error with details.

Example:

```javascript
try 
{
  await locator.destroy();
} 
catch (error) 
{
  console.error(error.code); // 'E_LOCATOR_DESTROY'
  console.error(error.cause); // Array of errors for each service taht failed to destroy
}
```

Error Codes:

- **E_LOCATOR_DESTROY**: Thrown when one or more destroy methods fail.
- **E_LOCATOR_DESTROY_SERVICE**: Thrown for individual service that fail to destroy.

---

### Error Handling

The module provides descriptive errors with unique codes to help debug common issues.

- **E_LOCATOR_LOCATE**: Thrown when trying to locate a non-existent service.
- **E_LOCATOR_LAZYLOAD**: Thrown when lazy loading a service fails.
- **E_LOCATOR_EAGERLOAD**: Thrown when eager loading fails.
- **E_LOCATOR_INVALID_SERVICE_MAP**: Thrown for invalid service map formats.
- **E_LOCATOR_SERVICE_UNRESOLVABLE**: Thrown when a service path cannot be resolved.
- **E_LOCATOR_INVALID_PATH**: Thrown for invalid or mismatched wildcard paths.
- **E_LOCATOR_DESTROY**: Thrown when one or more `destroy` methods fail.
- **E_LOCATOR_DESTROY_SERVICE**: Thrown for individual service `destroy` methods that fail.

Example:

```javascript
try 
{
  locator.locate('nonexistent/service');
} 
catch (error) 
{
  console.error(error.code, error.message);
}
```

---

## Running Tests

The module includes a test suite. Run the tests using:

```bash
node test
```

### Test Coverage

```
▶ @superhero/locator
  ▶ Lazyload
    ✔ Lazyload a service (4.828123ms)
    ✔ Lazyload same service multiple times (2.175617ms)
  ✔ Lazyload (7.965349ms)
  
  ▶ Eagerload
    ✔ Eagerload a service (2.271103ms)
    ✔ Eagerload the same service multiple times (0.933762ms)
    ✔ Eagerload multiple services by a collection definition (2.389402ms)
    ✔ Multiple services by a service path map (1.368324ms)
    ✔ Nested wildcard service (6.644221ms)
    ✔ Specific file by a wildcard service path map (2.014441ms)

    ▶ Using a locator
      ✔ Locator file (3.275955ms)
      ✔ Exported locate function (2.851036ms)
      ✔ Exported locator class (4.530722ms)
      ✔ Static self locator (2.690786ms)
      ✔ When the dependent service is loaded after the located service (1.780561ms)
    ✔ Using a locator (15.620721ms)
  ✔ Eagerload (32.099219ms)

  ▶ Rejects
    ✔ Lazyload a nonexistent path (2.06964ms)
    ✔ Lazyload a nonexistent path (1.023868ms)
    ✔ Directory path with no index or locator file (1.619045ms)
    ✔ Invalid wildcard path (0.7834ms)
    ✔ File path is used as a directory path (0.638767ms)
    ✔ Missmatched wildcard count (0.423624ms)
    ✔ Invalid service map types (0.973865ms)
    ✔ Noneexisting path (3.930104ms)
    ✔ Invalid wildcard path (2.209812ms)
    ✔ Throws error for attempting to locate a nonexisting service (0.415812ms)
  ✔ Rejects (14.858727ms)

  ▶ Destroy
    ✔ Successfully destroys a service (2.558189ms)
    ✔ Throws if fails to destroy a service (2.610999ms)
  ✔ Destroy (5.839146ms)

  ✔ Locate using the locator method (0.889694ms)
✔ @superhero/locator (90.014072ms)

tests 26
suites 6
pass 26

----------------------------------------------------------------------------------------------------
file            | line % | branch % | funcs % | uncovered lines
----------------------------------------------------------------------------------------------------
index.js        |  94.47 |    94.34 |   76.67 | 27-29 49-52 333-335 463-467 481-484 498-503 519-522
index.test.js   | 100.00 |   100.00 |   98.00 | 
----------------------------------------------------------------------------------------------------
all files       |  96.67 |    96.18 |   90.00 | 
----------------------------------------------------------------------------------------------------
```

---

## License
This project is licensed under the MIT License.

---

## Contributing
Feel free to submit issues or pull requests for improvements or additional features.

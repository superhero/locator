
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
await locator.eagerload({
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
export function locate(locator) {
  return { foobar: locator.locate('foobar') };
}
```

#### Example: Locator Class

```javascript
export class Locator {
  locate(locator) {
    return { foobar: locator.locate('foobar') };
  }
}
```

#### Example: Static Class `locate` Function

```javascript
export default class Foo {
  constructor(foobar) {
    this.foobar = foobar;
  }

  static locate(locator) {
    return new Foo(locator.locate('foobar'));
  }
}
```

### Destroy

Services can include a `destroy` method to clean up resources during shutdown or unloading. The locator will automatically call the `destroy` method for all services when the `destroy` method is invoked on the service locator.

#### Example: Using Destroy

Define a service with a `destroy` method:

```javascript
export default new class {
  destroy() {
    console.log('Service is being destroyed.');
  }
}
```

Destroy all loaded services:

```javascript
await locator.eagerload({
  serviceA: './services/serviceA.js',
  serviceB: './services/serviceB.js',
});

await locator.destroy();
```

#### Error Handling During Destroy

If a service's `destroy` method throws an error, the locator will aggregate these errors and throw a comprehensive error with details.

Example:

```javascript
try {
  await locator.destroy();
} catch (error) {
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
try {
  locator.locate('nonexistent/service');
} catch (error) {
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
    ✔ Lazyload a service (4.376028ms)
    ✔ Lazyload same service multiple times (1.193954ms)
  ✔ Lazyload (6.493337ms)
  
  ▶ Eagerload
    ✔ Eagerload a service (4.079377ms)
    ✔ Eagerload the same service multiple times (0.822597ms)
    ✔ Eagerload multiple services by a collection definition (2.390115ms)
    ✔ Multiple services by a service path map (1.384723ms)
    ✔ Nested wildcard service (3.740905ms)
    ✔ Specific file by a wildcard service path map (3.859331ms)

    ▶ Using a locator
      ✔ Locator file (3.278237ms)
      ✔ Exported locate function (3.117623ms)
      ✔ Exported locator class (2.106652ms)
      ✔ Static self locator (4.963107ms)
      ✔ When the dependent service is loaded after the located service (1.3365ms)
    ✔ Using a locator (15.338614ms)
  ✔ Eagerload (32.620482ms)

  ▶ Rejects
    ✔ Lazyload a nonexistent path (2.912138ms)
    ✔ Lazyload a nonexistent path (0.656041ms)
    ✔ Directory path with no index or locator file (1.361741ms)
    ✔ Invalid wildcard path (0.780617ms)
    ✔ File path is used as a directory path (0.621352ms)
    ✔ Missmatched wildcard count (0.318685ms)
    ✔ Invalid service map types (0.757284ms)
    ✔ Noneexisting path (1.381143ms)
    ✔ Invalid wildcard path (0.771358ms)
    ✔ Throws error for attempting to locate a nonexisting service (2.242825ms)
  ✔ Rejects (12.485229ms)

  ▶ Destroy
    ✔ Successfully destroys a service (6.235913ms)
    ✔ Throws if fails to destroy a service (2.991283ms)
  ✔ Destroy (9.57427ms)

  ✔ Locate using the locator method (0.7178ms)
✔ @superhero/locator (85.230119ms)

tests 26
suites 6
pass 26

----------------------------------------------------------------------------------------------
file            | line % | branch % | funcs % | uncovered lines
----------------------------------------------------------------------------------------------
index.js        |  94.99 |    93.20 |   78.57 | 23-25 310-312 438-442 456-459 473-478 494-497
index.test.js   | 100.00 |   100.00 |   98.00 | 
----------------------------------------------------------------------------------------------
all files       |  97.04 |    95.45 |   91.03 | 
----------------------------------------------------------------------------------------------
```

---

## License
This project is licensed under the MIT License.

---

## Contributing
Feel free to submit issues or pull requests for improvements or additional features.


# Locator

A Node.js service locator module, designed to manage dependency injections for services, using an eager or lazy loading approach. This module simplifies service management by dynamically resolving and loading services and their dependencies, supporting wildcard service path maps and agile service resolution methods.

## Features

- **Eager Loading**: Preload services in bulk for faster access, normally done at bootstrap.
- **Lazy Loading**: Dynamically load services when they are required, and keep them accessible.
- **Wildcard Service Paths**: Resolve services using wildcard paths, to ease the service registry.
- **Locator**: Locate a service using different implementation alternatives.
- **Destructor**: Support for a graceful release of services resources.
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
await locator.lazyload('foobar', './service.js');
const foobar = locator.locate('foobar');
```

### Eagerload Services

```javascript
await locator.eagerload({
  serviceA: './services/serviceA.js',
  serviceB: './services/serviceB.js',
});
const serviceA = locator.locate('serviceA');
const serviceB = locator.locate('serviceB');
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

### Destructors

Services can include a `destructor` method to clean up resources during shutdown or unloading. The locator will automatically call the `destructor` method for all services when the `destruct` method is invoked.

#### Example: Using Destructors

Define a service with a `destructor` method:

```javascript
export default new class {
  destructor() {
    console.log('Service is being destructed.');
  }
}
```

Destruct all loaded services:

```javascript
await locator.eagerload({
  serviceA: './services/serviceA.js',
  serviceB: './services/serviceB.js',
});

await locator.destruct();
```

#### Error Handling During Destruction

If a service's `destructor` throws an error, the locator will aggregate these errors and throw a comprehensive error with details.

Example:

```javascript
try {
  await locator.destruct();
} catch (error) {
  console.error(error.code); // 'E_LOCATOR_DESTRUCT'
  console.error(error.cause); // Array of errors for each failed service destructor
}
```

Error Codes:

- **E_LOCATOR_DESTRUCT**: Thrown when one or more destructors fail.
- **E_LOCATOR_DESTRUCT_SERVICE_DESTRUCTOR**: Thrown for individual service destructors that fail.

---

### Error Handling

The module provides descriptive errors with unique codes to help debug common issues.

- **E_LOCATOR_LOCATE**: Thrown when trying to locate a non-existent service.
- **E_LOCATOR_LAZYLOAD**: Thrown when lazy loading a service fails.
- **E_LOCATOR_EAGERLOAD**: Thrown when eager loading fails.
- **E_LOCATOR_INVALID_SERVICE_MAP**: Thrown for invalid service map formats.
- **E_LOCATOR_SERVICE_UNRESOLVABLE**: Thrown when a service path cannot be resolved.
- **E_LOCATOR_INVALID_PATH**: Thrown for invalid or mismatched wildcard paths.
- **E_LOCATOR_DESTRUCT**: Thrown when one or more destructors fail.
- **E_LOCATOR_DESTRUCT_SERVICE_DESTRUCTOR**: Thrown for individual service destructors that fail.

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
    ✔ Lazyload a service (6.182643ms)
    ✔ Lazyload same service multiple times (2.011848ms)
  ✔ Lazyload (9.551619ms)

  ▶ Eagerload
    ✔ Eagerload a service (3.009513ms)
    ✔ Eagerload the same service multiple times (0.966443ms)
    ✔ Eagerload multiple services by a collection definition (2.253287ms)
    ✔ Eagerload through the bootstrap method (1.2612ms)
    ✔ Multiple services by a service path map (1.424574ms)
    ✔ Nested wildcard service (5.031199ms)
    ✔ Specific file by a wildcard service path map (1.335819ms)
    ▶ Using a locator
      ✔ Locator file (6.458225ms)
      ✔ Exported locate function (4.934864ms)
      ✔ Exported locator class (3.30381ms)
      ✔ Static self locator (4.063844ms)
      ✔ When the dependent service is loaded after the located service (1.632379ms)
    ✔ Using a locator (20.914621ms)
  ✔ Eagerload (37.008545ms)

  ▶ Rejects
    ✔ Lazyload a nonexistent path (2.238264ms)
    ✔ Lazyload a nonexistent path (0.615457ms)
    ✔ Directory path with no index or locator file (1.06324ms)
    ✔ Invalid wildcard path (0.846293ms)
    ✔ File path is used as a directory path (2.753747ms)
    ✔ Missmatched wildcard count (0.708828ms)
    ✔ Invalid service map types (1.416482ms)
    ✔ Noneexisting path (3.45896ms)
    ✔ Invalid wildcard path (1.337589ms)
    ✔ Throws error for attempting to locate a nonexisting service (0.577147ms)
  ✔ Rejects (15.783164ms)

  ▶ Destruct
    ✔ Successfully destructs a service (2.788925ms)
    ✔ Throws if a destructor of a service fails to destruct (2.770051ms)
  ✔ Destruct (5.77378ms)

  ✔ Locate using the locator as the locate method (1.394766ms)
✔ @superhero/locator (95.142692ms)

tests 27
suites 6
pass 27

----------------------------------------------------------------------------------------
file            | line % | branch % | funcs % | uncovered lines
----------------------------------------------------------------------------------------
index.js        |  95.53 |    94.12 |  100.00 | 286-288 414-418 432-435 449-454 470-473
index.test.js   | 100.00 |   100.00 |   98.04 | 
----------------------------------------------------------------------------------------
all files       |  97.42 |    96.10 |   98.63 | 
----------------------------------------------------------------------------------------
```

---

## License
This project is licensed under the MIT License.

---

## Contributing
Feel free to submit issues or pull requests for improvements or additional features.

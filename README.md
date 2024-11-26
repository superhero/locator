
# Locator

A Node.js service locator module, designed to manage dependency injections for services, using an eager or lazy loading approach. This module simplifies service management by dynamically resolving and loading services and their dependencies, supporting wildcard service path maps and agile service resolution methods.

## Features

- **Eager Loading**: Preload services in bulk for faster access, normally done at bootstrap.
- **Lazy Loading**: Dynamically load services when they are required, and keep them accessible.
- **Wildcard Service Paths**: Resolve services using wildcard paths, to ease the service registry.
- **Locator**: Support different locator implementations.
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
const serviceA = locator.locate('services/serviceB');
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

### Error Handling

The module provides descriptive errors with unique codes to help debug common issues.

- **E_LOCATOR_LOCATE**: Thrown when trying to locate a non-existent service.
- **E_LOCATOR_LAZYLOAD**: Thrown when lazy loading a service fails.
- **E_LOCATOR_EAGERLOAD**: Thrown when eager loading fails.
- **E_LOCATOR_INVALID_SERVICE_MAP**: Thrown for invalid service map formats.
- **E_LOCATOR_SERVICE_UNRESOLVABLE**: Thrown when a service path cannot be resolved.
- **E_LOCATOR_INVALID_PATH**: Thrown for invalid or mismatched wildcard paths.

Example:

```javascript
try {
  locator.locate('nonexistent/service');
} catch (error) {
  console.error(error.code, error.message);
}
```

## Running Tests

The module includes a test suite. Run the tests using:

```bash
node test
```

### Test Coverage

```
▶ @superhero/locator
  ▶ Lazyload
    ✔ Lazyload a service (6.432655ms)
    ✔ Lazyload same service multiple times (1.221084ms)
  ✔ Lazyload (8.843422ms)

  ▶ Eagerload
    ✔ Eagerload a service (3.860612ms)
    ✔ Eagerload the same service multiple times (0.931989ms)
    ✔ Eagerload multiple services by a collection definition (3.273159ms)
    ✔ Eagerload through the bootstrap method (1.58633ms)
    ✔ Multiple services by a service path map (1.283204ms)
    ✔ Nested wildcard service (6.668795ms)
    ✔ Specific file by a wildcard service path map (1.218867ms)
    ▶ Using a locator
      ✔ Locator file (4.056506ms)
      ✔ Exported locate function (3.817437ms)
      ✔ Exported locator class (6.962377ms)
      ✔ Static self locator (1.964958ms)
      ✔ When the dependent service is loaded after the located service (1.336269ms)
    ✔ Using a locator (18.6873ms)
  ✔ Eagerload (38.283536ms)

  ▶ Rejects
    ✔ Lazyload a nonexistent path (4.286185ms)
    ✔ Lazyload a nonexistent path (0.736062ms)
    ✔ Directory path with no index or locator file (0.943326ms)
    ✔ Invalid wildcard path (0.904292ms)
    ✔ File path is used as a directory path (1.394164ms)
    ✔ Missmatched wildcard count (0.717327ms)
    ✔ Invalid service map types (0.736322ms)
    ✔ Noneexisting path (3.11004ms)
    ✔ Invalid wildcard path (1.181704ms)
    ✔ Throws error for attempting to locate a nonexisting service (0.409472ms)
  ✔ Rejects (15.177013ms)
  ✔ Locate using the locator as the locate method (2.391365ms)
✔ @superhero/locator (87.618494ms)

tests 25
pass 25

----------------------------------------------------------------------------------------
file            | line % | branch % | funcs % | uncovered lines
----------------------------------------------------------------------------------------
index.js        |  95.02 |    93.62 |  100.00 | 236-238 364-368 382-385 399-404 420-423
index.test.js   | 100.00 |   100.00 |   97.83 | 
----------------------------------------------------------------------------------------
all files       |  97.18 |    95.74 |   98.46 | 
----------------------------------------------------------------------------------------
```

---

## License
This project is licensed under the MIT License.

---

## Contributing
Feel free to submit issues or pull requests for improvements or additional features.

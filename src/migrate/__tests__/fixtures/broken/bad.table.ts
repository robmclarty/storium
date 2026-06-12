// Intentionally broken fixture: throws at import time to exercise the
// fatal import-error path in collectSchemas() and the seed runner's store
// discovery. Lives under a dedicated `broken/` directory so the regular
// `entities/*` globs never pick it up.
throw new Error('intentional import failure: this fixture cannot be loaded')

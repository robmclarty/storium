/**
 * @module storium
 */
const validator = require('validator')

/**
 * Test that the given key is valid.
 *
 * TODO: enhance this with additional validation logic and built-in conditions
 */
const test = key => (value, validation = () => true, custom_error) => {
  const handle_error = msg => {
    if (!custom_error) throw new Error(msg)
    if (typeof custom_error === 'string') throw new Error(custom_error)
    if (typeof custom_error === 'function') custom_error(msg)
  }

  if (value === undefined || value === 'undefined') {
    handle_error(`${key} is undefined`)
  }

  if (typeof validation === 'string') {
    switch (validation) {
      case 'is_url':
        if (!validator.isURL(value)) handle_error(`${key} of '${value}' is not a valid url`)
        return
      case 'is_email':
        if (!validator.isEmail(value)) handle_error(`${key} of '${value}' is not a valid email address`)
        return
      case 'is_numeric':
        if (!validator.isNumeric(value)) handle_error(`${key} of '${value}' is not a number`)
        return
      case 'not_empty':
        if (validator.isEmpty(value)) handle_error(`${key} cannot be empty`)
        return
      default:
        handle_error(`no test named '${validation}'`)
    }
  }

  if (typeof validation === 'function' && !validation(value)) {
    handle_error(`${key} is not valid`)
  }
}

const schema = (schema_dfn = {}) => {
  // TODO: validate the schema shape to verify it is compatible.

  return schema_dfn
}

/**
 * Return a new object that maps all the attributes of `obj` to sanitized
 * versions of each key in the schema, dropping any keys not in the schema.
 *
 * WARNING: This is an async function and returns a promise (even if the user-defined
 * function is not a promise, it will be treated as a promise regardless in order
 * to support anything the user needs).
 */
const sanitize_record = (schema_dfn = {}) => async (obj = {}, options = {}) => {
  const schema_keys = Object.keys(schema_dfn)

  // Remove unsupported keys from `obj`.
  //
  // Don't include keys not defined in schema + no keys that are literally
  // `undefined`. Might want to define a key and optionally pass in the
  // literal value of `undefined`; in which case, should behave as if the key
  // was never defined.
  const valid_keys = Object.keys(obj).reduce((acc, key) => {
    const is_valid = schema_keys.includes(key) && obj[key] !== undefined

    if (!is_valid) return acc

    return [...acc, key]
  }, [])

  // Build an array of promises to sanitized values (will be in the same order
  // as `valid_keys` such that each valid_key index corresponds to a value in
  // `value_promises`.
  const value_promises = []

  valid_keys.forEach(key => {
    const raw_value = obj[key]
    const sanitizer = schema_dfn[key]?.sanitize
    const has_sanitizer = sanitizer !== undefined && typeof sanitizer === 'function'

    if (!has_sanitizer) {
      value_promises.push(raw_value)
    } else {
      value_promises.push(sanitizer(raw_value))
    }
  })

  // Convert promises to real values and map them to a dictionary (object) of
  // key/value pairs to be returned.
  const sanitized_values = await Promise.all(value_promises)
  const sanitized_record = valid_keys.reduce((acc, key, index) => {
    return {
      ...acc,
      [key]: sanitized_values[index]
    }
  }, {})

  return sanitized_record
}

/**
 * Validate each attribute of `obj` using the validation functions defined in
 * the store's schema, skipping attributes that do not have a validation
 * function or aren't defined in the schema.
 *
 * If no customizations, infer type using shorthand for defining type by directly
 * assigning a root JS constructor (e.g., Number, String, Date, Boolean).
 * Otherwise, if using a custom object, use the explicit `type` value
 * assigned within that object.
 */
const validate_record = (schema_dfn = {}) => (obj = {}, options = {}) => {
  const {
    skip_required = false
  } = options

  Object.keys(schema_dfn).forEach(key => {
    const schema_attr = schema_dfn[key]
    const is_custom = typeof schema_attr === 'object'
    const type = is_custom ? schema_attr.type : schema_attr
    const value = obj[key]

    // If this is a custom attribute definition, run custom logic.
    if (is_custom) {
      const is_required = (!skip_required && schema_attr?.required) || false
      const has_value = value !== undefined

      // If this is a custom definition and it is required, validate that `value` exists.
      // Explicitly looking for `undefined` since some values might be `false` or `null`.
      if (!has_value && is_required) {
        throw new Error(`\`${key}\` is required`)
      }

      // If this is a custom definition and it contains a `validate()` function,
      // evaluate the custom validation.
      if (has_value && typeof schema_attr.validate === 'function') {
        schema_attr.validate(obj[key], test(key))
      }

      return
    }

    // Do not run basic type validations if no value exists (all basic types are
    // treated as optional). If a value is required, it needs to be explicitly
    // defined using a custom definition and `dfn.required = true`.
    if (value === undefined) return

    // Basic type validations (if this is not a custom attribute definition, but
    // instead a simple native type).
    switch (type) {
      case Object:
        if (typeof value !== 'object') throw new Error(`\`${key}\` must be an Object`)
        break
      case Number:
        if (typeof value !== 'number') throw new Error(`\`${key}\` must be a Number`)
        break
      case String:
        if (typeof value !== 'string') throw new Error(`\`${key}\` must be a String`)
        break
      case Boolean:
        if (typeof value !== 'boolean') throw new Error(`\`${key}\` must be a Boolean`)
        break
      case Date:
        if (value instanceof Date) throw new Error(`\`${key}\` must be a Date`)
        break
      case BigInt:
        if (typeof value !== 'bigint') throw new Error(`\`${key}\` must be a BigInt`)
        break
      default:
        if (typeof value === 'undefined') {
          throw new Error(`\`${key}\` must be a known data type: Object, Number, String, Boolean, BigInt, or Date`)
        }
    }
  })

  return obj
}

/**
 * Return an object that contains only the attributes in `obj` defined in `mutables`.
 */
const mutable_record = (mutables = []) => (obj = {}) => {
  const mutable_input = Object.keys(obj).reduce((acc, key) => {
    if (!mutables.includes(key)) return acc

    return {
      ...acc,
      [key]: obj[key]
    }
  }, {})

  return mutable_input
}

/**
 * Take `raw_input` object and filter its properties based on `options`.
 *
 * Sanitize and validate `raw_input` (changes input values based on sanitize
 * definitions) unless caller specifies `force` to skip.
 *
 * By default, allows any value who's key that has been defined in the schema.
 *
 * If `only_mutables` is explicitly set to `true` then only those attributes
 * that have been marked as `mutable` in the schema will be prepped.
 *
 * @param {object} raw_input - input object containing table attribute keys + values
 * @param {object} [options] - optional controls
 * @param {boolean} [options.force=false] - skip all filtering, sanitization, and validation
 * @param {boolean} [options.validate_required=true] - enforce all required attributes are defined
 * @param {boolean} [options.only_mutables=false] - only prep valid mutable attributes
 * @returns {object} - prepared input object
 */
const prep_record = ({
  sanitize = val => val,
  validate = val => val,
  mutable = val => val
}) => async (raw_input = {}, options = {}) => {
  const {
    force = false,
    validate_required = true,
    only_mutables = false
  } = options

  let prepared_input = raw_input

  // Only sanitize and validate if not being forced + validate is true.
  if (!force) {
    const mutable_input = only_mutables
      ? mutable(raw_input)
      : raw_input
    const sanitized_input = await sanitize(mutable_input)
    const validated_input = validate(sanitized_input, {
      skip_required: !validate_required
    })

    prepared_input = validated_input
  }

  return prepared_input
}

/**
 * Append user-defined attributes to store. Any function definitions will
 * be called with the store's core passed as a first parameter. It is expected
 * that this will return a new function with the core within its scope.
 *
 * Other non-function attributes will be appeneded as defined by the user.
 */
const append = (core = {}, obj = {}) => {
  return Object.keys(obj).reduce((acc, key) => {
    // Call as function, passing `core` as 1st param.
    if (typeof obj[key] === 'function') {
      return {
        ...acc,
        [key]: obj[key](core)
      }
    }

    // Assign value directly when not a function.
    return {
      ...acc,
      key: obj[key]
    }
  }, {})
}

/**
 * Create basic store with generic query functions for database that can be used
 * by any table.
 */
const store = knex => (name, schema_dfn = {}, other = {}) => {
  if (!name) return {}

  ///////////////////////////////////////////////////////////////////// State //
  // Unless explicitly set to `false`, `isSelectable` is treated as `true`.
  const selectables = Object.keys(schema_dfn).reduce((acc, key) => {
    if (schema_dfn[key].selectable === false) return acc

    return [...acc, key]
  }, [])

  // Unless explicitly set to `true`, `mutable` is treated as `false`.
  const mutables = Object.keys(schema_dfn).reduce((acc, key) => {
    if (schema_dfn[key].mutable !== true) return acc

    return [...acc, key]
  }, [])

  /////////////////////////////////////////////////////////////////// Helpers //
  const sanitize = sanitize_record(schema_dfn)
  const validate = validate_record(schema_dfn)
  const mutable = mutable_record(mutables)
  const prep = prep_record({ sanitize, validate, mutable })

  /////////////////////////////////////////////////////////////////// Queries //
  const find = async filters => {
    return knex.select(selectables)
      .from(name)
      .where(filters)
  }

  const find_all = async () => {
    return find({})
  }

  const find_one = async filters => {
    return knex.first(selectables)
      .from(name)
      .where(filters)
  }

  const find_by_id = async id => {
    return knex.first(selectables)
      .from(name)
      .where({ id })
  }

  const find_by_id_in = async ids => {
    return knex.select(selectables)
      .from(name)
      .whereIn('id', ids)
  }

  const create = async (raw_input = {}, options = {}) => {
    const input = await prep(raw_input, options)

    return knex.insert(input)
      .into(name)
      .returning(selectables)
      .then(([result]) => result) // Return first element of returned array.
  }

  // Skip required attributes since this might be a partial update (not all attributes).
  // However, can be overriden with options.
  const update = async (id, raw_input = {}, options = {}) => {
    const input = await prep(raw_input, {
      validate_required: false,
      ...options
    })

    return knex.update(input)
      .from(name)
      .where({ id })
      .returning(selectables)
      .then(([result]) => result) // Return first element of returned array.
  }

  const destroy = async id => {
    return knex.del()
      .from(name)
      .where({ id })
  }

  const destroy_all = async filters => {
    return knex.del()
      .from(name)
      .where(filters)
  }

  ///////////////////////////////////////////////////////////////////// Store //
  const core = {
    knex,
    name,
    schema: schema_dfn,
    selectables,
    mutables,
    sanitize,
    validate,
    mutable,
    prep,
    find,
    find_all,
    find_one,
    find_by_id,
    find_by_id_in,
    create,
    update,
    destroy,
    destroy_all
  }

  return {
    ...core,
    ...append(core, other)
  }
}

/**
 * Create a new Storium instance.
 */
const constructor = knex => {
  // TODO: handle validating supported versions of knex

  return {
    knex,
    store: store(knex),
    schema,
    test
  }
}

module.exports = constructor

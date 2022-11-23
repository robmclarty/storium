# Storium

Storium is an abstraction layer that works on top of (and with)
[Knex](https://knexjs.org/).

I built this as a more intermediate level abstraction that extends the capabilities
of Knex, groups some common functionality (stantization, validation, restrictions)
for convenience, but stands back and doesn't try to dictate how your data
structures should look or behave like a full ORM might do.

With this, you can think less about the low-level database/query problems, and
more about your app-level storage problems (i.e., not *how* things are stored,
but *what* gets stored and how should your app *behave*). You are in control
of the *how* by defining your own query functions, validations, sanitizations,
and schemas.

## Install

`npm install storium`

## Usage

### Init

To initialze `storium` I like wrapping it in my own "adapter" module which helps
act as a singleton reference from the rest of my application (I do the same with
`knex` as well). Then I only need to worry about configuration and initialization
in one central location that's predictable to reference.

See: https://knexjs.org/guide/#configuration-options

`knex.js`

```javascript
const knex = require('knex')({
  client: 'pg',
  connection: {
    host : '127.0.0.1',
    port : 5432,
    user : 'your_database_user',
    password : 'your_database_password',
    database : 'myapp_test'
  }
})

module.exports = knex
```

All that's needed to configure `storium` is to pass your configured `knex`
instance reference into it.

`storium.js`

```javascript
const knex = require('./knex.js')
const storium = require('@barss/storium')(knex)

module.exports = storium
```

### Store

With a configured instance of `storium` you can now use it to create new
*stores* by providing its database table *name*, a *schema*, and any custom
query functions you've created that you'd like to append to the store.

The basic way to create a new store is to use the `storium.store()` function
like this:

`example_store.js`

```javascript
const storium = require('./storium.js')

const example_schema = storium.schema({
  // ...see example schema below
})

const custom_func_1 = () => {}
const custom_func_2 = () => {}
const custom_func_3 = () => {}

const example_store = storium.store('examples', example_schema, {
  custom_func_1,
  custom_func_2,
  custom_func_3
})

module.exports = example_store
```

The signature for the `store()` function is as follows:

`storium.store(table_name, schema_dfn, optional_custom_functions)`

- `table_name` is the literal string name of the database table for this store
- `schema_dfn` is an object containing the schema definition (see below)
- `optional_custom_functions` is an object containing custom query functions

I'll explain custom query functions below, but out of the box, a store will have
the following query functions:

- `find()`
- `find_all()`
- `find_one()`
- `find_by_id()`
- `find_by_id_in()`
- `create()`
- `update()`
- `destroy()`
- `destroy_all()`

...as well as other helper functions and properties:

- `knex`
- `name`
- `schema`
- `selectables`
- `mutables`
- `sanitize()`
- `validate()`
- `mutable()`
- `prep()`

### Schema

A *schema* is a way to define what properties can be seen, what properties can
be modified, custom transformations to "sanitize" input data, which properties
are required, as well as various validations and types.

Each property in the schema must correspond exactly to the underlying database
table columns being referenced when the store is initialized. Use square
brackets if your table names cannot be defined as JS names (e.g.,
`['my-custom-column-name']`).

```javascript
const my_custom_validation = value => {
  return value === 'something custom'
}

const example_schema = storium.schema({
  id: Number,
  user_id: {
    type: Number,
    required: true
  },
  name: {
    type: String,
    mutable: true
  },
  url: {
    type: String,
    mutable: true,
    required: true,
    sanitize: value => String(value).trim(),
    validate: (value, test) => {
      test(value, 'not_empty', 'url must have a non-empty value')
      test(value, my_custom_validation, 'url must be a valid')
    }
  },
  is_admin: Boolean,
  created_at: Date,
  updated_at: Date
})
```

In this example, some properties are given a simple basic JS type. By
default, a property will be treated as valid only if the input type matches the
basic JS type defined in the schema.

More customizations can be made by assigning a custom object to a property
schema, in which you can define various other settings such as custom
`sanitize()` logic, custom `validate()` logic, if a property is "mutable" (that
is, marking it as a field that a user can modify), a basic JS type, if
the property is a required field, and whether it is selectable (e.g., perhaps
on a user store you want to explicitly say that the `password` field should not
be selectable as it is only used during authentication).

The `test()` function that is passed into the `validate()` function provides a
basic way to validate a `value`. It is not a requirement, but provides some
convenience. It's signature is `test(value, validation, error)` where `value` is
the value being tested, `validation` can be either a function which returns
`true` if the value is valid, or a string referencing one of the built-in
validation methods ('is_url', 'is_email', 'is_numeric', or 'not_empty'). And
finally `error` is either a string message to be thrown when not valid, or a
function which will be called back when not valid and handled however you want
to handle it.

### Custom Queries

If the basic set of query functions is not sufficient, you can easily append
additional custom query functions too. Each function takes the core storium
properties listed above and should return a new function which takes your
custom input.

```javascript
const find_by_username_or_email = ({ knex, selectables, name }) => async ({ email, username }) => {
  return knex.first(selectables)
    .from(name)
    .where({ username: String(username) })
    .orWhere({ email: String(email) })
}

const find_by_user_id = ({ knex, selectables, name }) => async user_id => {
  return knex.select(selectables)
    .from(name)
    .where({ user_id })
}

const update_last_login = ({ knex, update }) => async id => {
  return update(id, {
    login_at: knex.fn.now()
  }, { force: true })
}

// Override the default `create()` function, but call default as result.
const transformed_create = ({ knex, selectables, name, create }) => async input => {
  // ...do something custom here (e.g., maybe transform the input or check some data first?)
  const transformed_input = my_transformer(input)

  // Pass intermediate result to default create() function (not necessary, but one use-case example):
  return create(transformed_input)
}

const example_store = storium.store('examples', example_schema, {
  find_by_username_or_email,
  find_by_user_id,
  update_last_login,
  create: transformed_create // overrides default create
})
```

### Use

From elsewhere in your app, you can use your new store modules to interface with
your database without being concerned about the details of *how* that works.
Storium (and Knex) will have encapsulated all storage concerns providing a
higher level interface for usage within your app.

Assuming some sort of [ExpressJS](https://expressjs.com/) app, a given
resource's control functions might look something like this:

`example_controller.js`

```javascript
const example_store = require('./example_store.js')

// POST /examples
const create_example = async (req, res, next) => {
  const example = await example_store.create(req.body)

  res.json({
    message: 'Example created',
    example
  })
}

// GET /examples
const get_all_examples = async (req, res, next) => {
  const examples = await example_store.find_all()

  res.json({
    message: 'Examples found',
    examples
  })
}

// GET /users/:user_id/examples
//
// This is an example of using a custom-defined query function (same kind of
// interface as defaults).
const get_user_examples = async (req, res, next) => {
  const user_id = Number(req.params.user_id)
  const examples = await example_store.find_by_user_id(user_id)

  res.json({
    message: 'User examples found',
    examples
  })
}

// GET /examples/:example_id
const get_example = async (req, res, next) => {
  const example_id = Number(req.params.example_id)
  const example = await example_store.find_by_id(example_id)

  res.json({
    message: 'Example found',
    example
  })
}

// PATCH /examples/:example_id
const modify_example = async (req, res, next) => {
  const example_id = Number(req.params.example_id)
  const example = await example_store.update(example_id, req.body)

  res.json({
    message: 'Example updated',
    example
  })
}

// DELETE /examples/:example_id
const remove_example = async (req, res, next) => {
  const example_id = Number(req.params.example_id)
  const num_removed = await example_store.destroy(example_id)

  res.json({
    message: 'Example updated',
    num_removed
  })
}

module.exports = {
  create_example,
  get_all_examples,
  get_example,
  modify_example,
  remove_example
}
```

## License

MIT

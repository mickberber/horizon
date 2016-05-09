import { Observable } from 'rxjs/Observable'
// Observable static methods
import { merge } from 'rxjs/observable/merge'
import { of } from 'rxjs/observable/of'
import { forkJoin } from 'rxjs/observable/forkJoin'

// Observable operators
import { combineLatest } from 'rxjs/operator/combineLatest'
import { map } from 'rxjs/operator/map'
import { _do as tap } from 'rxjs/operator/do'

// Other imports
import isPlainObject from 'is-plain-object'

// Project imports
import { isRecursivelyPrimitive } from './util/is-recursively-primitive'

// Unlike normal queries' .watch(), we don't support rawChanges: true
// for aggregates
function checkWatchArgs(args) {
  if (args.length > 0) {
    throw new Error(".watch() on models doesn't support arguments!")
  }
}

function hasTermInterface(possibleTerm) {
  return typeof possibleTerm.fetch === 'function' &&
         typeof possibleTerm.watch === 'function'
}

function hasObservableInterface(possibleObservable) {
  return typeof possibleObservable.subscribe === 'function' &&
         typeof possibleObservable.lift === 'function'
}

// Simple wrapper for primitives. Just emits the primitive
class PrimitiveSpec {
  constructor(value) {
    this._value = value
  }

  fetch() {
    return Observable::of(this._value)
  }

  watch() {
    checkWatchArgs(arguments)
    return Observable::of(this._value)
  }
}

// Simple wrapper for observables to normalize the
// interface. Everything in a model tree should be one of these
// term-likes
class ObservableSpec {
  constructor(value) {
    this._obs = value
  }

  fetch() {
    return this._obs
  }

  watch() {
    checkWatchArgs(arguments)
    return this._obs
  }
}

// Handles model syntax like [ query1, query2 ]
class ArraySpec {
  constructor(queries) {
    // Ensure this._queries is an array of observables
    this._subqueries = queries.map(x => model(x))
  }

  fetch() {
    // Convert each query to an observable
    const qs = this._subqueries.map(x => x.fetch())
    // Merge the results of all of the observables into one array
    return Observable::forkJoin(...qs, (...args) =>
                                Array.prototype.concat(...args))
  }

  watch() {
    checkWatchArgs(arguments)
    const qs = this._subqueries.map(x => x.watch())
    return Observable::combineLatest(...qs,
      args => Array.prototype.concat(...args))
  }
}

class ModelSpec {
  constructor(modelObject) {
    this._modelKeys = Object.keys(modelObject).map(key =>
      [ key, model(modelObject[key]) ])
  }

  fetch() {
    const observs = this._modelKeys.map(([ k, term ]) => {
      // We jam the key into the observable so when it emits we know
      // where to put it in the object
      return term.fetch()::map(val => [ k, val ])
    })
    return Observable::forkJoin(...observs, (...keyVals) => {
      // reconstruct the object
      const finalObject = {}
      for (const [ key, val ] of keyVals) {
        finalObject[key] = val
      }
      return finalObject
    })
  }

  watch() {
    checkWatchArgs(arguments)
    throw new Error('watch unimplemented')
  }
}

export function model(modelSpec) {
  if (hasTermInterface(modelSpec)) {
    return modelSpec
  } else if (hasObservableInterface(modelSpec)) {
    return new ObservableSpec(modelSpec)
  } else if (isRecursivelyPrimitive(modelSpec)) {
    return new PrimitiveSpec(modelSpec)
  } else if (Array.isArray(modelSpec)) {
    return new ArraySpec(modelSpec)
  } else if (isPlainObject(modelSpec)) {
    return new ModelSpec(modelSpec)
  } else {
    throw new Error(`Can't make a model with ${modelSpec} in it`)
  }
}

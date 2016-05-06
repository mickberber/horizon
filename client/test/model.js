import { Observable } from 'rxjs/Observable'
import { merge } from 'rxjs/observable/merge'

import { concat } from 'rxjs/operator/concat'

import { assertCompletes, removeAllDataObs, observableInterleave } from './utils'

// Raises an exception if corresponding elements in an array don't
// have the same elements (in any order)
function arrayHasSameElements(a, b) {
  if (a.length !== b.length) {
    return false
  }
  for (let i = 0; i < a.length; i++) {
    assert.sameDeepMembers(a[i], b[i])
  }
}

const modelSuite = window.modelSuite = (getData, getHorizon) => () => {
  let data, horizon, hzA, hzB
  before(() => {
    data = getData()
    horizon = getHorizon()
    hzA = horizon('testA')
    hzB = horizon('testB')
  })
  afterEach(done => {
    Observable::merge(
      removeAllDataObs(hzA),
      removeAllDataObs(hzB),
      removeAllDataObs(data)).subscribe({
        next() { },
        error(err) { done(err) },
        complete() { done() },
      })
  })

  // A model can just consist of a subquery
  it('is equivalent to a subquery if it is not passed an object',
     assertCompletes(() => {
       const underlyingQuery = data.order('id').limit(3)
       return data.insert([
         { id: 1 },
         { id: 2 },
         { id: 3 },
         { id: 4 },
       ])::concat(observableInterleave({
         query: horizon.model(underlyingQuery).fetch(),
         operations: [],
         expected: [
           [ { id: 1 }, { id: 2 }, { id: 3 } ],
         ],
       }))
     })
    )

  it('combines multiple queries in an array into one',
     assertCompletes(() => {
       const query = horizon.model([ hzA, hzB ]).fetch()
       const expected = [
         { id: 1 },
         { id: 2 },
         { id: 3 },
         { id: 4 },
       ]
       return hzA.insert([
         { id: 1 },
         { id: 3 },
       ])::concat(hzB.insert([
         { id: 2 },
         { id: 4 },
       ]))::concat(observableInterleave({
         query,
         operations: [],
         equality: arrayHasSameElements,
         expected: [ expected ],
       }))
     })
    )

  it('allows constants in an array spec', assertCompletes(() => {
    const query = horizon.model([ 1, hzA ]).fetch()
    const expected = [ 1, { id: 1 }, { id: 2 } ]
    return hzA.insert([
      { id: 1 },
      { id: 2 },
    ])::concat(observableInterleave({
      query,
      operations: [],
      equality: arrayHasSameElements,
      expected: [ expected ],
    }))
  }))

  it('allows a fully constant model of primitives', assertCompletes(() => {
    const model = {
      a: 'Some string',
      b: [ true ],
      c: new Date(),
      d: {
        e: new ArrayBuffer(),
        f: 1.2,
        g: [ 1.3, true, new Date(), { } ],
      },
    }
    const query = horizon.model(model).fetch()
    return observableInterleave({
      query,
      operations: [],
      equality: assert.deepEqual,
      expected: [ model ],
    })
  }))

  it('aggregates data from objects', assertCompletes(() => {
    const hzAContents = [
      { id: 1, a: true },
      { id: 2, b: false },
      { id: 3, c: true },
      { id: 4, d: true },
    ]
    const hzBContents = [
      { id: 5, e: 'E' },
      { id: 6, f: 'F' },
      { id: 7, g: 'G' },
      { id: 8, h: 'H' },
    ]
    const query = horizon.model({
      item1: hzA.find(1),
      item2: hzB.above({ id: 5 }).below({ id: 8 }),
    }).fetch()
    const expectedResult = {
      item1: { id: 1, a: true },
      item2: [
        { id: 5, e: 'E' },
        { id: 6, f: 'F' },
        { id: 7, g: 'G' },
      ],
    }
    return hzA.insert(hzAContents)::concat(hzB.insert(hzBContents))
    ::concat(observableInterleave({
      query,
      operations: [],
      equality: assert.deepEqual,
      expected: [ expectedResult ],
    }))
  }))
}

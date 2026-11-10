import assert from 'node:assert/strict'
import { planStaffReorder } from '../src/lib/staff-order.ts'
const fixture = (...values) => values.map((sortOrder, index) => ({
 id:'staff-'+index, sortOrder, name:'狐姬'+index,
}))
const ids = rows => rows.map(row=>row.id).join(',')

const normal = planStaffReorder(fixture(10,20,30), 'staff-2', 0)
assert.equal(ids(normal.ordered),'staff-2,staff-0,staff-1')
assert.equal(normal.changes.length,1)
assert.equal(normal.changes[0].before,30)
assert.ok(normal.changes[0].after<10)
assert.deepEqual(fixture(10,20,30).map(x=>x.sortOrder),[10,20,30])

const end=planStaffReorder(fixture(10,20,30), 'staff-0', 2)
assert.equal(ids(end.ordered),'staff-1,staff-2,staff-0')
assert.equal(end.changes.length,1)
assert.ok(end.changes[0].after>30)

const middle=planStaffReorder(fixture(100,200,300), 'staff-2', 1)
assert.equal(ids(middle.ordered),'staff-0,staff-2,staff-1')
assert.equal(middle.changes.length,1)
assert.equal(middle.changes[0].after,150)

const adjacent=planStaffReorder(fixture(100,101,102), 'staff-2', 1)
assert.equal(ids(adjacent.ordered),'staff-0,staff-2,staff-1')
assert.ok(adjacent.ordered.every((row,i)=>i===0||row.sortOrder>adjacent.ordered[i-1].sortOrder))
assert.ok(adjacent.changes.length>=2)

const duplicates=planStaffReorder(fixture(50,50,50), 'staff-2', 0)
assert.equal(ids(duplicates.ordered),'staff-2,staff-0,staff-1')
assert.ok(duplicates.ordered.every((row,i)=>i===0||row.sortOrder>duplicates.ordered[i-1].sortOrder))
assert.ok(duplicates.changes.length>=2)

const boundary=planStaffReorder(fixture(2147483600,2147483647), 'staff-0', 1)
assert.equal(ids(boundary.ordered),'staff-1,staff-0')
assert.ok(boundary.ordered.every(row=>row.sortOrder<=2147483647))
assert.ok(boundary.changes.length>=1)

const invalid=planStaffReorder(fixture(10,20,30), 'not-found', 2)
assert.equal(invalid.changes.length,0)
assert.equal(ids(invalid.ordered),'staff-0,staff-1,staff-2')

console.log('PASS: one-row reorder, drag endpoints, midpoint insertion, duplicate/adjacent rebalance, integer boundary and invalid move')

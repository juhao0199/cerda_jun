import {test} from 'node:test';
import assert from 'node:assert/strict';
import {monthDays,shiftMonth,calendarDate,utcSchedule} from '../lib/publishing-calendar.ts';
test('UTC calendar aligns Monday and handles leap February',()=>{const days=monthDays('2024-02');assert.equal(days[0],null);assert.equal(days[3],'2024-02-01');assert.equal(days.at(-1),'2024-02-29');assert.equal(shiftMonth('2026-12',1),'2027-01');});
test('published day uses actual release time instead of original scheduled time',()=>{assert.equal(calendarDate('2026-12-01T00:00:00Z','2026-11-30T23:00:00Z','published'),'2026-11-30');});
test('UTC input is explicit and impossible dates rejected',()=>{assert.equal(utcSchedule('2026-11-25T12:30'),'2026-11-25T12:30:00.000Z');assert.equal(utcSchedule('2026-02-30T12:30'),null);assert.equal(utcSchedule(''),null);});

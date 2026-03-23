import test from "node:test";
import assert from "node:assert/strict";
import { buildAlertsQuery } from "../routes/alerts.js";

test("buildAlertsQuery maps exact filters and normalizes type/mitre casing", () => {
  const query = buildAlertsQuery({
    status: "investigating",
    severityLevel: "critical",
    type: "deauthflood",
    source: "simulated",
    mitreTechnique: "t1499",
    correlatedOnly: "true"
  });

  assert.equal(query.status, "investigating");
  assert.equal(query.severityLevel, "critical");
  assert.equal(query.type, "DEAUTHFLOOD");
  assert.equal(query.source, "simulated");
  assert.equal(query["mitre.technique_id"], "T1499");
  assert.deepEqual(query.correlationCount, { $gt: 1 });
});

test("buildAlertsQuery ignores sentinel 'all' filters", () => {
  const query = buildAlertsQuery({
    status: "all",
    severityLevel: "all",
    type: "all",
    source: "all",
    mitreTechnique: "all"
  });

  assert.deepEqual(query, {});
});

test("buildAlertsQuery builds escaped regex OR search clause", () => {
  const query = buildAlertsQuery({ search: "T1499(attack)+" });

  assert.ok(Array.isArray(query.$or));
  assert.equal(query.$or.length, 6);

  const regex = query.$or[0].type;
  assert.ok(regex instanceof RegExp);

  // Escaped regex should match literal search input, not regex meta behavior.
  assert.equal(regex.test("...T1499(attack)+..."), true);
  assert.equal(regex.test("...T1499attack..."), false);
});

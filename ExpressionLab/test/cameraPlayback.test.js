import test from "node:test";
import assert from "node:assert/strict";

import {
  freezeCamera,
  getPrimaryCameraAction,
  isPrimaryCameraActionDisabled,
  resumeCamera,
} from "../src/cameraPlayback.js";

test("freezeCamera leaves the captured video frame paused", () => {
  const video = {
    paused: false,
    pause() {
      this.paused = true;
    },
  };

  assert.equal(freezeCamera(video), true);
  assert.equal(video.paused, true);
});

test("a camera result requires returning to live view before measuring again", () => {
  assert.equal(
    getPrimaryCameraAction({ sourceMode: "camera", hasResult: true }),
    "resume",
  );
  assert.equal(
    getPrimaryCameraAction({ sourceMode: "camera", hasResult: false }),
    "measure",
  );
  assert.equal(
    getPrimaryCameraAction({ sourceMode: "photo", hasResult: true }),
    "measure",
  );
});

test("resumeCamera restarts a paused camera stream", async () => {
  const video = {
    paused: true,
    srcObject: { active: true },
    async play() {
      this.paused = false;
    },
  };

  assert.equal(await resumeCamera(video), true);
  assert.equal(video.paused, false);
});

test("cooldown blocks measuring but never blocks returning a result to live view", () => {
  const shared = { faceReady: true, busy: false, cooldown: 10 };

  assert.equal(
    isPrimaryCameraActionDisabled({ ...shared, action: "resume" }),
    false,
  );
  assert.equal(
    isPrimaryCameraActionDisabled({
      ...shared,
      action: "resume",
      faceReady: false,
    }),
    false,
  );
  assert.equal(
    isPrimaryCameraActionDisabled({ ...shared, action: "measure" }),
    true,
  );
});

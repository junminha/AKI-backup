const JOINTS = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
};

const average = (a, b) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function angle(a, b, c) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const cosine = (ab.x * cb.x + ab.y * cb.y) /
    (Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y) || 1);
  return Math.round((Math.acos(Math.max(-1, Math.min(1, cosine))) * 180) / Math.PI);
}

const round = (number, digits = 2) => Number(number.toFixed(digits));

function armDirection(shoulder, wrist) {
  const dx = wrist.x - shoulder.x;
  const dy = wrist.y - shoulder.y;
  if (dy < -0.18) return "up";
  if (Math.abs(dy) < 0.13 && Math.abs(dx) > 0.18) return "side";
  if (Math.abs(dx) < 0.14 && dy > 0.16) return "down";
  return dy < 0 ? "diagonal-up" : "diagonal-down";
}

export function averageLandmarks(samples) {
  if (!samples.length) return null;

  return samples[0].map((_, index) => {
    const visible = samples
      .map((sample) => sample[index])
      .filter((point) => point && (point.visibility ?? 1) > 0.35);
    if (!visible.length) return samples[samples.length - 1][index];

    return {
      x: visible.reduce((sum, point) => sum + point.x, 0) / visible.length,
      y: visible.reduce((sum, point) => sum + point.y, 0) / visible.length,
      z: visible.reduce((sum, point) => sum + point.z, 0) / visible.length,
      visibility: visible.reduce((sum, point) => sum + (point.visibility ?? 1), 0) / visible.length,
    };
  });
}

export function compactPose(landmarks) {
  const point = (name) => landmarks[JOINTS[name]];
  const ls = point("leftShoulder");
  const rs = point("rightShoulder");
  const le = point("leftElbow");
  const re = point("rightElbow");
  const lw = point("leftWrist");
  const rw = point("rightWrist");
  const lh = point("leftHip");
  const rh = point("rightHip");
  const lk = point("leftKnee");
  const rk = point("rightKnee");
  const la = point("leftAnkle");
  const ra = point("rightAnkle");
  const shoulderMid = average(ls, rs);
  const hipMid = average(lh, rh);
  const scale = Math.max(distance(ls, rs), distance(shoulderMid, hipMid), 0.08);
  const selected = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

  return {
    arm: [armDirection(ls, lw), armDirection(rs, rw)],
    elbow: [angle(ls, le, lw), angle(rs, re, rw)],
    knee: [angle(lh, lk, la), angle(rh, rk, ra)],
    hands: round(distance(lw, rw) / scale),
    stance: round(distance(la, ra) / scale),
    lean: round((shoulderMid.x - hipMid.x) / scale),
    ankleHeightGap: round((la.y - ra.y) / scale),
    wristsAboveHead: [lw.y < point("nose").y, rw.y < point("nose").y],
    xy: selected.map((index) => [
      round((landmarks[index].x - hipMid.x) / scale),
      round((landmarks[index].y - hipMid.y) / scale),
    ]),
  };
}

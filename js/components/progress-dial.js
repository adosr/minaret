export function createProgressDialController(elements) {
  const circumference = 2 * Math.PI * 44;
  let introAnimated = false;

  elements.ring.style.strokeDasharray = `${circumference}`;
  elements.gloss.style.strokeDasharray = "18 999";
  elements.ring.style.strokeDashoffset = `${circumference}`;
  elements.gloss.style.strokeDashoffset = `${circumference}`;

  function setKnobAngle(angleDeg) {
    const radius = 44;
    const angleRad = angleDeg * Math.PI / 180;
    const x = Math.cos(angleRad) * radius;
    const y = Math.sin(angleRad) * radius;
    elements.knob.style.transform = `translate(${x}px, ${y}px)`;
  }

  function drawRatio(ratio) {
    const clamped = Math.max(0, Math.min(1, ratio));
    const offset = circumference * (1 - clamped);
    const angle = -90 + (360 * clamped);

    elements.ring.style.strokeDashoffset = `${offset}`;
    elements.gloss.style.strokeDashoffset = `${offset + 8}`;
    setKnobAngle(angle);
  }

  function animateIntro(ratio) {
    const clamped = Math.max(0, Math.min(1, ratio));
    const startTime = performance.now();
    const duration = 1100;

    function frame(now) {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      drawRatio(clamped * eased);
      if (t < 1) requestAnimationFrame(frame);
    }

    drawRatio(0);
    requestAnimationFrame(frame);
    introAnimated = true;
  }

  return {
    render(ratio, countdownText) {
      if (elements.countdown) elements.countdown.textContent = countdownText;
      if (!introAnimated) animateIntro(ratio);
      else drawRatio(ratio);
    },
    reset() {
      introAnimated = false;
      drawRatio(0);
    }
  };
}

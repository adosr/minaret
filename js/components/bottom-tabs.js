export function initBottomTabs({ tabBar, activePill, onSelectPage }) {
  const pill = activePill;
  const buttons = Array.from(tabBar.querySelectorAll(".tab-btn"));

  const state = {
    currentX: 0,
    currentW: 84,
    targetX: 0,
    targetW: 84,
    velocityX: 0,
    isPointerDown: false,
    pointerId: null,
    pointerStartX: 0,
    pillStartX: 0,
    lastPointerX: 0,
    lastMoveTime: 0,
    pressScale: 1,
    tabBarScale: 1,
    pressedTab: null,
    didDrag: false,
    suppressClick: false,
    raf: null,
    lastTs: 0
  };

  function getTabMetrics() {
    const rects = buttons.map((btn) => btn.getBoundingClientRect());
    return { rects };
  }

function getButtonMetrics(btn) {
  return {
    x: btn.offsetLeft - 2,
    w: btn.offsetWidth
  };
}

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function rubberBand(distance, dimension, constant = 0.55) {
    return (distance * dimension * constant) / (dimension + constant * Math.abs(distance));
  }

  function setActiveTab(activeBtn) {
    buttons.forEach((btn) => {
      btn.classList.toggle("active", btn === activeBtn);
    });
  }

  function clearTabOverlapFeedback() {
    const activeBtn = tabBar.querySelector(".tab-btn.active");

    buttons.forEach((btn) => {
      const isActive = btn === activeBtn;

      btn.style.setProperty("--tab-hit", isActive ? "1" : "0");
      btn.style.setProperty("--lens-push-x", "0px");
      btn.style.setProperty("--lens-scale-x", "1");
      btn.style.setProperty("--lens-scale-y", "1");
      btn.style.setProperty("--lens-blur", "0px");
      btn.style.setProperty("--lens-sat", "0");

      if (isActive) {
        btn.style.setProperty("--accent-left", "0px");
        btn.style.setProperty("--accent-right-inset", "0px");
      } else {
        btn.style.setProperty("--accent-left", "0px");
        btn.style.setProperty("--accent-right-inset", `${btn.offsetWidth}px`);
      }
    });
  }

  function updateTabOverlapFeedback() {
    const pillRect = pill.getBoundingClientRect();
    const { rects } = getTabMetrics();
    const pillLeft = pillRect.left;
    const pillRight = pillRect.right;
    const pillCenter = pillRect.left + pillRect.width / 2;

    buttons.forEach((btn, index) => {
      if (!state.isPointerDown && btn.classList.contains("active")) {
        btn.style.setProperty("--accent-left", "0px");
        btn.style.setProperty("--accent-right-inset", "0px");
      }

      const rect = rects[index];
      const overlapLeft = Math.max(pillLeft, rect.left);
      const overlapRight = Math.min(pillRight, rect.right);
      const overlap = Math.max(0, overlapRight - overlapLeft);

      const ratio = clamp(overlap / rect.width, 0, 1);
      btn.style.setProperty("--tab-hit", ratio.toFixed(4));

      if (overlap <= 0) {
        if (!btn.classList.contains("active") || state.isPointerDown) {
          btn.style.setProperty("--accent-left", "0px");
          btn.style.setProperty("--accent-right-inset", `${rect.width.toFixed(2)}px`);
        }
      } else {
        const localOverlapLeft = clamp(overlapLeft - rect.left, 0, rect.width);
        const localOverlapRight = clamp(overlapRight - rect.left, 0, rect.width);
        const rightInset = clamp(rect.width - localOverlapRight, 0, rect.width);

        btn.style.setProperty("--accent-left", `${localOverlapLeft.toFixed(2)}px`);
        btn.style.setProperty("--accent-right-inset", `${rightInset.toFixed(2)}px`);
      }

      const btnCenter = rect.left + rect.width / 2;
      const distance = pillCenter - btnCenter;
      const normalized = clamp(distance / (rect.width / 2), -1, 1);
      const influence = ratio;

      const pushX = normalized * 3.6 * influence;
      const scaleX = 1 + 0.085 * influence;
      const scaleY = 1 - 0.05 * influence;
      const blur = 0.55 * influence;
      const sat = 0.22 * influence;

      btn.style.setProperty("--lens-push-x", `${pushX.toFixed(3)}px`);
      btn.style.setProperty("--lens-scale-x", scaleX.toFixed(4));
      btn.style.setProperty("--lens-scale-y", scaleY.toFixed(4));
      btn.style.setProperty("--lens-blur", `${blur.toFixed(3)}px`);
      btn.style.setProperty("--lens-sat", sat.toFixed(4));
    });
  }

  function applyPill(x, width, scale = 1) {
    const safeWidth = Math.max(44, width);

    state.currentX = x;
    state.currentW = safeWidth;

    pill.style.width = `${safeWidth}px`;
    pill.style.transform = `translateX(${x}px) scale(${scale})`;

    updateTabOverlapFeedback();
  }

  function applyTabBarScale(scale = 1) {
    tabBar.style.transform = `scale(${scale})`;
  }

  function getBounds() {
    const xs = buttons.map((btn) => getButtonMetrics(btn).x);

    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs)
    };
  }

  function nearestTabByCenter(centerX) {
    let bestBtn = buttons[0];
    let bestDistance = Infinity;

    for (const btn of buttons) {
      const { x, w } = getButtonMetrics(btn);
      const btnCenter = x + w / 2;
      const distance = Math.abs(centerX - btnCenter);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestBtn = btn;
      }
    }

    return bestBtn;
  }

  function findTabUnderPointer(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    const tab = el?.closest?.(".tab-btn") || null;
    return tab && tabBar.contains(tab) ? tab : null;
  }

  function setPillDraggingVisual(isDragging) {
    pill.classList.toggle("dragging", isDragging);
    pill.style.transition = "none";
    pill.style.transformOrigin = "center center";
  }

  function isPillSettled() {
    return (
      !state.isPointerDown &&
      Math.abs(state.targetX - state.currentX) < 0.12 &&
      Math.abs(state.targetW - state.currentW) < 0.12 &&
      Math.abs(state.velocityX) < 0.12
    );
  }

  function startAnimation() {
    if (state.raf !== null) return;
    state.raf = requestAnimationFrame(animate);
  }

  function moveToTab(btn, immediate = false) {
    const { x, w } = getButtonMetrics(btn);

    state.targetX = x;
    state.targetW = w;

    setActiveTab(btn);

    if (immediate) {
      state.currentX = x;
      state.currentW = w;
      state.velocityX = 0;
      state.pressScale = 1;
      state.tabBarScale = 1;

      pill.classList.remove("dragging");
      pill.style.transition = "";
      pill.style.transformOrigin = "center center";

      applyTabBarScale(1);
      applyPill(x, w, 1);
      clearTabOverlapFeedback();
      return;
    }

    startAnimation();
  }

  function animate(ts) {
    if (!state.lastTs) {
      state.lastTs = ts;
    }

    const frameMs = ts - state.lastTs;
    const dt = Math.min(2.2, frameMs / 16.6667);
    state.lastTs = ts;

    if (state.isPointerDown) {
      state.currentW = lerp(state.currentW, state.targetW, 0.22 * dt);

      setPillDraggingVisual(true);
      applyTabBarScale(state.tabBarScale);
      applyPill(state.currentX, state.currentW, state.pressScale);

      state.raf = requestAnimationFrame(animate);
      return;
    }

    state.currentW = lerp(state.currentW, state.targetW, 0.16 * dt);

    const dx = state.targetX - state.currentX;
    state.velocityX += dx * 0.12 * dt;
    state.velocityX *= Math.pow(0.8, dt);
    state.currentX += state.velocityX;

    state.pressScale = lerp(state.pressScale, 1, 0.18 * dt);
    state.tabBarScale = lerp(state.tabBarScale, 1, 0.18 * dt);

    if (!isPillSettled()) {
      setPillDraggingVisual(true);
    }

    applyTabBarScale(state.tabBarScale);
    applyPill(state.currentX, state.currentW, state.pressScale);

    const done =
      Math.abs(state.targetX - state.currentX) < 0.12 &&
      Math.abs(state.targetW - state.currentW) < 0.12 &&
      Math.abs(state.velocityX) < 0.12;

    if (done) {
      state.currentX = state.targetX;
      state.currentW = state.targetW;
      state.velocityX = 0;
      state.pressScale = 1;
      state.tabBarScale = 1;

      pill.classList.remove("dragging");
      pill.style.transition = "";
      pill.style.transformOrigin = "center center";

      applyTabBarScale(1);
      applyPill(state.currentX, state.currentW, 1);
      clearTabOverlapFeedback();

      state.raf = null;
      state.lastTs = 0;
      return;
    }

    state.raf = requestAnimationFrame(animate);
  }

  function commitSelection(button, immediate = false) {
    if (!button) return;

    moveToTab(button, immediate);

    const pageId = button.dataset.pageTarget;
    onSelectPage(pageId);

    if (!immediate && window.navigator.vibrate) {
      window.navigator.vibrate(10);
    }
  }

  function onPointerDown(event) {
    const hitTab = event.target.closest(".tab-btn");
    if (!hitTab || !tabBar.contains(hitTab)) return;

    state.pointerId = event.pointerId;
    state.isPointerDown = true;
    state.pointerStartX = event.clientX;
    state.pillStartX = state.currentX;
    state.lastPointerX = event.clientX;
    state.lastMoveTime = performance.now();

    state.pressedTab = hitTab;
    state.didDrag = false;
    state.suppressClick = false;
    state.velocityX = 0;

    state.pressScale = 1.3;
    state.tabBarScale = 1.03;

    const { w } = getButtonMetrics(hitTab);

    state.targetW = w;
    state.currentW = state.currentW ? lerp(state.currentW, w, 0.35) : w;

    setActiveTab(hitTab);

    if (tabBar.setPointerCapture) {
      tabBar.setPointerCapture(event.pointerId);
    }

    setPillDraggingVisual(true);
    applyPill(state.currentX, state.currentW || w, state.pressScale);
    startAnimation();

    event.preventDefault();
  }

  function onPointerMove(event) {
    if (!state.isPointerDown || event.pointerId !== state.pointerId) return;

    const now = performance.now();
    const dx = event.clientX - state.pointerStartX;
    let nextX = state.pillStartX + dx;

    const { minX, maxX } = getBounds();

    if (nextX < minX) {
      nextX = minX - rubberBand(minX - nextX, 140);
    } else if (nextX > maxX) {
      nextX = maxX + rubberBand(nextX - maxX, 140);
    }

    const dt = Math.max(1, now - state.lastMoveTime);

    state.velocityX = ((event.clientX - state.lastPointerX) / dt) * 16;
    state.currentX = nextX;

    if (Math.abs(dx) > 3) {
      state.didDrag = true;
      state.suppressClick = true;
    }

    state.pressScale =
      1.3 + Math.min(0.05, Math.abs(dx) * 0.0009 + Math.abs(state.velocityX) * 0.0012);

    state.tabBarScale =
      1.03 + Math.min(0.015, Math.abs(dx) * 0.00025 + Math.abs(state.velocityX) * 0.00035);

    const hoveredTab = findTabUnderPointer(event.clientX, event.clientY);
    if (hoveredTab) {
      const { w } = getButtonMetrics(hoveredTab);
      state.targetW = w;
      setActiveTab(hoveredTab);
    }

    state.lastPointerX = event.clientX;
    state.lastMoveTime = now;

    applyPill(state.currentX, state.currentW, state.pressScale);
    startAnimation();

    event.preventDefault();
  }

  function finishPointerInteraction(event) {
    if (!state.isPointerDown || event.pointerId !== state.pointerId) return;

    state.isPointerDown = false;

    if (tabBar.hasPointerCapture?.(event.pointerId)) {
      tabBar.releasePointerCapture(event.pointerId);
    }

    const pressedTab = state.pressedTab;
    const didDrag = state.didDrag;

    state.pointerId = null;
    state.pressedTab = null;
    state.didDrag = false;

    if (!didDrag && pressedTab) {
      commitSelection(pressedTab, false);
      return;
    }

    state.currentX += state.velocityX * 6;

    const { minX, maxX } = getBounds();
    state.currentX = clamp(state.currentX, minX, maxX);

    const centerX = state.currentX + state.currentW / 2;
    const closestTab = nearestTabByCenter(centerX);

    commitSelection(closestTab, false);
  }

  function onPointerUp(event) {
    finishPointerInteraction(event);
  }

  function onPointerCancel(event) {
    finishPointerInteraction(event);
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", (event) => {
      if (state.suppressClick) {
        event.preventDefault();
        event.stopPropagation();
        state.suppressClick = false;
        return;
      }

      commitSelection(btn, false);
    });
  });

  tabBar.addEventListener("pointerdown", onPointerDown, { passive: false });
  tabBar.addEventListener("pointermove", onPointerMove, { passive: false });
  tabBar.addEventListener("pointerup", onPointerUp);
  tabBar.addEventListener("pointercancel", onPointerCancel);

  window.addEventListener("resize", () => {
    const activeBtn = tabBar.querySelector(".tab-btn.active");
    if (activeBtn && !state.isPointerDown) {
      moveToTab(activeBtn, true);
    }
  });

  function syncActiveTabPosition() {
    const activeBtn = tabBar.querySelector(".tab-btn.active") || buttons[0];
    if (!activeBtn) return;

    commitSelection(activeBtn, true);
    clearTabOverlapFeedback();
  }

  function finalizeInitialPosition() {
    const run = () => {
      syncActiveTabPosition();
      pill.style.opacity = "1";
    };

    if (document.fonts?.ready) {
      document.fonts.ready.then(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(run);
        });
      });
      return;
    }

    window.addEventListener(
      "load",
      () => {
        requestAnimationFrame(() => {
          requestAnimationFrame(run);
        });
      },
      { once: true }
    );

    setTimeout(run, 120);
  }

  return {
    initialize() {
      pill.style.opacity = "0";
      syncActiveTabPosition();
      finalizeInitialPosition();
    },

    activate(pageId) {
      const match = buttons.find((button) => button.dataset.pageTarget === pageId);
      if (match) {
        commitSelection(match, false);
      }
    }
  };
}
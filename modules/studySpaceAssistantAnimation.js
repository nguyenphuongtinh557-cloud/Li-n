import { gsap } from 'gsap';

const layerFiles = [
  ['base', 'base.webp'],
  ['eye', '4.webp'],
  ['arrow', '3.webp'],
  ['sparkle', '2.webp'],
  ['accent', '1.webp']
];

export function animateStudySpaceHeroAccents(svg) {
  if (!svg) return () => {};

  const bottomCurves = [...svg.querySelectorAll('.study-hub-flow-bottom-curve')];
  const particles = [...svg.querySelectorAll('.study-hub-flow-particle')];
  const stars = [...svg.querySelectorAll('.study-hub-flow-spark')];
  const particleTweens = particles.map(particle => {
    const curve = bottomCurves[Math.floor(Math.random() * bottomCurves.length)];
    const curveLength = curve.getTotalLength();
    const segmentLength = 0.32 + Math.random() * 0.28;
    const segmentStart = Math.random() * (1 - segmentLength);
    const progress = { value: segmentStart };
    const duration = 2.8 + Math.random() * 1.8;

    gsap.set(particle, { x: 0, y: 0, autoAlpha: 0 });

    return gsap.to(progress, {
      value: segmentStart + segmentLength,
      duration,
      ease: 'sine.inOut',
      repeat: -1,
      yoyo: true,
      delay: Math.random() * 1.3,
      repeatDelay: 0.25 + Math.random() * 0.8,
      onUpdate: () => {
        const point = curve.getPointAtLength(curveLength * progress.value);
        gsap.set(particle, { x: point.x, y: point.y, autoAlpha: 0.78 });
      }
    });
   });
  const starTweens = stars.map((star, index) => gsap.to(star, {
    opacity: 0.14,
    duration: 1.1 + (index % 2) * 0.25,
    ease: 'sine.inOut',
    repeat: -1,
    yoyo: true,
    delay: index * 0.24,
    transformOrigin: 'center center'
  }));

  return () => {
    [...particleTweens, ...starTweens].forEach(tween => tween.kill());
    gsap.killTweensOf([...particles, ...stars]);
  };
}

export function mountStudySpaceAssistantButton(button) {
  if (!button) return () => {};

  const stage = document.createElement('span');
  stage.className = 'study-space-ai-art';
  stage.setAttribute('aria-hidden', 'true');

  const images = Object.fromEntries(layerFiles.map(([name, file]) => {
    const image = document.createElement('img');
    image.className = `study-space-ai-layer layer-${name}`;
    image.src = `/public/study-space-ai-layers/${file}`;
    image.alt = '';
    image.draggable = false;
    stage.append(image);
    return [name, image];
  }));

  button.classList.add('study-space-ai-button');
  button.type = 'button';
  button.setAttribute('aria-label', 'Hỏi trợ lý AI');
  button.replaceChildren(stage);

  const blinkTimeline = gsap.timeline({
    repeat: -1,
    repeatDelay: 2.4,
    defaults: { ease: 'power2.out', duration: 0.4 }
  });

  for (let blink = 0; blink < 3; blink += 1) {
    blinkTimeline
      .set(images.eye, { autoAlpha: 0 }, '+=0.1')
      .set(images.eye, { autoAlpha: 1 }, '+=0.1');
  }

  let clickTimeline = null;
  const onPointerEnter = () => {
    if (clickTimeline?.isActive()) return;
    gsap.to(images.accent, { x: 4, y: -2, duration: 0.28, ease: 'power2.out', overwrite: 'auto' });
    gsap.to(images.sparkle, { x: -3, y: -3, duration: 0.3, ease: 'power2.out', overwrite: 'auto' });
  };
  const onPointerLeave = () => {
    if (clickTimeline?.isActive()) return;
    gsap.to([images.accent, images.sparkle], { x: 0, y: 0, duration: 0.28, ease: 'power2.out', overwrite: 'auto' });
  };
  const onButtonClick = () => {
    clickTimeline?.kill();
    gsap.killTweensOf([images.accent, images.sparkle]);

    const isHovered = button.matches(':hover') || button.matches(':focus');
    const accentX = isHovered ? 4 : 0;
    const accentY = isHovered ? -2 : 0;
    const sparkleX = isHovered ? -3 : 0;
    const sparkleY = isHovered ? -3 : 0;

    clickTimeline = gsap.timeline({
      onComplete: () => {
        const shouldKeepHoverPose = button.matches(':hover') || button.matches(':focus');
        gsap.set(images.accent, { x: shouldKeepHoverPose ? 4 : 0, y: shouldKeepHoverPose ? -2 : 0, scale: 1 });
        gsap.set(images.sparkle, { x: shouldKeepHoverPose ? -3 : 0, y: shouldKeepHoverPose ? -3 : 0, rotation: 0 });
        clickTimeline = null;
      }
    });

    clickTimeline
      .to(images.accent, { x: accentX + 10, y: accentY - 10, scale: 1.14, duration: 0.28, ease: 'power2.out' }, 0)
      .to(images.accent, { x: accentX, y: accentY, scale: 1, duration: 0.72, ease: 'power2.out' }, 0.28)
      .to(images.sparkle, { rotation: -8, duration: 0.08, ease: 'power1.out' }, 0)
      .to(images.sparkle, { rotation: 8, duration: 0.08, ease: 'power1.inOut' }, 0.08)
      .to(images.sparkle, { rotation: -5, duration: 0.08, ease: 'power1.inOut' }, 0.16)
      .to(images.sparkle, { rotation: 4, duration: 0.08, ease: 'power1.inOut' }, 0.24)
      .to(images.sparkle, { x: sparkleX, y: sparkleY, rotation: 0, duration: 0.68, ease: 'power2.out' }, 0.32);
  };

  button.addEventListener('pointerenter', onPointerEnter);
  button.addEventListener('pointerleave', onPointerLeave);
  button.addEventListener('focus', onPointerEnter);
  button.addEventListener('blur', onPointerLeave);
  button.addEventListener('click', onButtonClick);

  return () => {
    blinkTimeline?.kill();
    clickTimeline?.kill();
    gsap.killTweensOf([images.eye, images.accent, images.sparkle]);
    button.removeEventListener('pointerenter', onPointerEnter);
    button.removeEventListener('pointerleave', onPointerLeave);
    button.removeEventListener('focus', onPointerEnter);
    button.removeEventListener('blur', onPointerLeave);
    button.removeEventListener('click', onButtonClick);
  };
}
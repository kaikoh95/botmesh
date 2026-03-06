import TownScene from './scenes/TownScene.js';

export function createGame(container) {
  return new Promise((resolve) => {
    const config = {
      type: Phaser.AUTO,
      parent: container,
      width: container.clientWidth,
      height: container.clientHeight,
      backgroundColor: '#4a7c59',
      pixelArt: true,
      roundPixels: true,
      scene: [TownScene],
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      audio: { noAudio: true },
    };

    const game = new Phaser.Game(config);

    // Poll until TownScene is active — avoids race with 'ready' event
    const poll = setInterval(() => {
      const scene = game.scene.getScene('TownScene');
      if (scene && scene.scene.isActive('TownScene')) {
        clearInterval(poll);
        resolve(scene);
      }
    }, 100);
  });
}

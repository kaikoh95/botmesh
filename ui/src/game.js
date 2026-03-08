import TownScene from './scenes/TownScene.js';

export function createGame(container) {
  return new Promise((resolve, reject) => {
    const config = {
      type: Phaser.AUTO,
      parent: container,
      width: container.clientWidth,
      height: container.clientHeight,
      backgroundColor: '#1e3320',
      pixelArt: true,
      roundPixels: true,
      scene: [TownScene],
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      audio: { noAudio: true },
      callbacks: {
        postBoot: (game) => {
          game.events.on('error', (e) => {
            console.error('[Phaser] Game error:', e);
          });
        }
      }
    };

    let game;
    try {
      game = new Phaser.Game(config);
    } catch (e) {
      console.error('[createGame] Phaser init failed:', e);
      reject(e);
      return;
    }

    // Poll until TownScene is active — avoids race with 'ready' event
    // Timeout after 12s so init() doesn't hang if scene fails to start
    const start = Date.now();
    const poll = setInterval(() => {
      try {
        const scene = game.scene.getScene('TownScene');
        if (scene && scene.scene.isActive('TownScene')) {
          clearInterval(poll);
          resolve(scene);
          return;
        }
      } catch (e) {
        console.error('[createGame] poll error:', e);
      }

      if (Date.now() - start > 12000) {
        clearInterval(poll);
        console.error('[createGame] Timeout — TownScene never became active');
        // Resolve with null so init() can continue without blocking
        resolve(null);
      }
    }, 100);
  });
}

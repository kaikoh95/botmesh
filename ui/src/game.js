import TownScene from './scenes/TownScene.js';

export function createGame(container) {
  const config = {
    type: Phaser.AUTO,
    parent: container,
    width: container.clientWidth,
    height: container.clientHeight,
    backgroundColor: '#4a7c59',
    pixelArt: true,
    scene: [TownScene],
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    audio: { noAudio: true },
  };

  const game = new Phaser.Game(config);

  // Return a promise that resolves with the TownScene once ready
  return new Promise((resolve) => {
    game.events.once('ready', () => {
      const checkScene = () => {
        const scene = game.scene.getScene('TownScene');
        if (scene && scene.sys.isActive()) {
          resolve(scene);
        } else {
          setTimeout(checkScene, 50);
        }
      };
      checkScene();
    });
  });
}

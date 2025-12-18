class StoryMode {
    constructor() {
        this.scenes = 9; // Total number of scenes
        this.currentScene = 1;
        this.container = document.getElementById('story-container');
        this.imageElement = document.getElementById('story-image');
        this.audioElement = new Audio();
        this.basePath = 'assets/images/storyline/scene '; // Note space
        this.audioPath = 'assets/audio/scene ';   // Note space
        this.isPlaying = false;

        // Bind 'Skip' or Click to advance? User didn't ask, but good for testing.
        // For now, strictly follow "Automatically transition".
    }

    start() {
        // Hide Home
        document.getElementById('home-screen').style.display = 'none';

        // Show Story
        this.container.classList.remove('hidden');
        this.container.style.display = 'flex';

        this.currentScene = 1;
        this.playScene();

        // Ensure FS Button is Top Right
        const fsBtn = document.getElementById('btn-fullscreen');
        if (fsBtn) fsBtn.classList.remove('gameplay-pos');
    }

    playScene() {
        if (this.currentScene > this.scenes) {
            this.endStory();
            return;
        }

        const sceneNum = this.currentScene;

        // Setup Image
        // Fade out first (if not first scene, but we can just set opacity 0 then 1)
        this.imageElement.style.opacity = 0;

        setTimeout(() => {
            if (sceneNum > this.scenes) return; // Safety

            this.imageElement.src = `${this.basePath}${sceneNum}.png`;

            // Wait for image load to fade in?
            this.imageElement.onload = () => {
                this.imageElement.style.opacity = 1;
                this.playAudio(sceneNum);
            };
        }, 500); // Small delay for fade out visual
    }

    playAudio(num) {
        this.audioElement.src = `${this.audioPath}${num}.mp3`;
        this.audioElement.play().catch(e => console.log("Audio play failed (interaction?):", e));

        this.audioElement.onended = () => {
            this.nextScene();
        };
    }

    nextScene() {
        this.currentScene++;
        this.playScene();
    }

    endStory() {
        // Stop audio immediately
        this.audioElement.pause();
        this.audioElement.currentTime = 0;

        // Fade out story container
        this.container.style.opacity = 0;
        setTimeout(() => {
            this.container.style.display = 'none';
            this.container.classList.add('hidden');

            // Start Game
            if (typeof startGame === 'function') {
                startGame();
            }
        }, 1000);
    }
}

const storyMode = new StoryMode();
window.startStory = () => storyMode.start();

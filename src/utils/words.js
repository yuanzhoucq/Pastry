// Word list for generating word-word format passwords
const words = [
  'apple', 'banana', 'cherry', 'dragon', 'eagle', 'falcon', 'grape', 'harbor',
  'island', 'jungle', 'kite', 'lemon', 'mango', 'north', 'ocean', 'panda',
  'quartz', 'river', 'storm', 'tiger', 'unity', 'violet', 'whale', 'xray',
  'yoga', 'zebra', 'anchor', 'breeze', 'castle', 'dawn', 'ember', 'forest',
  'glacier', 'hollow', 'ivory', 'jasper', 'karma', 'lunar', 'marble', 'nova',
  'orbit', 'peak', 'quest', 'rain', 'solar', 'thunder', 'ultra', 'valley',
  'willow', 'xenon', 'yarn', 'zenith', 'azure', 'blaze', 'coral', 'delta',
  'echo', 'flame', 'gold', 'haven', 'iron', 'jade', 'keen', 'lotus',
  'meadow', 'night', 'olive', 'pine', 'quill', 'rose', 'sage', 'thorn',
  'umbra', 'vine', 'wave', 'xerox', 'yield', 'zephyr', 'atlas', 'bolt',
  'crest', 'dusk', 'edge', 'frost', 'glow', 'haze', 'ink', 'jewel'
];

function generateWordPassword() {
  const word1 = words[Math.floor(Math.random() * words.length)];
  const word2 = words[Math.floor(Math.random() * words.length)];
  return `${word1}-${word2}`;
}

module.exports = { generateWordPassword, words };

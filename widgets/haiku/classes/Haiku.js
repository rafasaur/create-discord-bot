// Haiku.js
// class takes in message, checks for haiku, sends via calling sendHaiku() method
// based on https://github.com/turt2live/matrix-haiku-bot
// note 'syllable' is a much more effective package than 'syllables'

const syllables = require('syllable');
const config = require('../haiku-config');

const emojiReg = /[<][0-9a-zA-Z\S]+[>]/g
const urlReg = /^(http:\/\/www\.|https:\/\/www\.|http:\/\/|https:\/\/)?[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/.*)?$/g
const digReg = /[0-9]+/g;
const ignoredRegs = [urlReg,emojiReg];


module.exports = class Haiku {
  constructor(message) {
    this.content = message.content;
    this.channel = message.channel;
    this.author = message.author;

    this.allowedForms = config.allowedForms || [ [5,7,5] ];
    this.archiveChannelId = config.archiveChannel || '';

    //this.alwaysChannels = message.client.widgets.haiku.alwaysChannels;
    this.ignoredChannels = message.client.widgets.haiku.ignoredChannels;
    this.tempChannels = message.client.widgets.haiku.tempChannels;

    this.haikuLines = [];
    this.isHaiku = this.checkHaiku();
  }


  checkHaiku () {
    for (const form of this.allowedForms) {
      if (this.checkForm(form)) return true;
    }
    return false;
  }


  checkForm(form) {
    //console.log('checking form...')
    const content = this.content;
    let haikuLines = [];
    let lineSyllables = 0; let totalSyllables = 0; let currentLine = 0;

    const words = (content || "").split(/[\s]+/g);
    for (let word of words) {
      if (word.length === 0) continue; // skip any 0-length words from split()-ing
      if (word.search(/\d+/g) >= 0) return false; // syllable doesn't like digits
      if (ignoredRegs.some(reg => word.search(reg) >= 0) ) continue; // skip stuff we want to ignore
      const wordSyllables = syllables(word.replace(/[^a-zA-Z]/g,'')); // a little ham-fisted, but good enough
      if (wordSyllables === 0) return false; // just avoid unknown words

      if (lineSyllables + wordSyllables > form[currentLine]) return false; // not a haiku

      if (!haikuLines[currentLine]) haikuLines[currentLine] = '';
      haikuLines[currentLine] = haikuLines[currentLine] + " " + word;
      lineSyllables += wordSyllables;
      totalSyllables += wordSyllables;

      if (lineSyllables === form[currentLine]) {currentLine++; lineSyllables = 0;}
    }

    if (totalSyllables !== form.reduce((total,value) => total + value)) {
      //console.log(`total syllable check fail with ${totalSyllables}`);
      return false;
    }

    let completedHaikuLines = [];
    for (const line of haikuLines) {
      if (line.trim().length > 0) completedHaikuLines.push(line);
    }

    if (completedHaikuLines.length !== 3) { // fixes some weird edge cases
      let fixedLines = [];
      for (i = 0; i < 3; i++) {
        if (syllables(completedHaikuLines[i]) !== form[i]) return false;
        fixedLines.push(completedHaikuLines[i]);
      }
      completedHaikuLines = fixedLines;
    }
    //console.log(completedHaikuLines);
    this.haikuLines = completedHaikuLines;
    return true;
  }


  sendHaiku () {
    if ( // double-check
      this.ignoredChannels.has(this.channel.id) ||
      this.tempChannels.has(this.channel.id) ||
      !this.isHaiku
    ) return;

    let haikuText = '';
    for (const line of this.haikuLines) {
      haikuText += line.trim() + "\n";
    }
    haikuText = haikuText.trim();

    this.channel.send(`A haiku by ${this.author}:\n>>> ` + haikuText).then(async msg => {
      console.log(`haiku by ${this.author} sent!`);
      if (this.channel.type === "dm") return;
      const ogr = await msg.react('🚫');
      let repost = true;
      const filter = (reaction, user) => {
        //return (!user.bot && user.id === this.author.id);
        if (user.bot) return false;
        if (user.id !== this.author.id) return false;
        else return true;
      }
      const collector = msg.createReactionCollector(filter, {time:5*60*1000});
      collector.on("collect", reaction => {
        if (reaction.emoji.name === '🚫') {msg.delete(); repost=false;}
      });
      collector.on("end", () => {
        ogr.remove();
        if (
          repost &&
          this.archiveChannelId && this.archiveChannelId.length > 0 &&
          this.channel.type !== 'dm'
        ) {
          const archiveChannel = this.channel.guild.channels.resolve(this.archiveChannelId);
          archiveChannel.send(`A haiku by \`${this.author.tag}\`:\n>>> ` + haikuText);
        }
      });
    });
  }
}

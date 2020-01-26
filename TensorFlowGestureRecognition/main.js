import {KNNImageClassifier} from 'deeplearn-knn-image-classifier';
import * as dl from 'deeplearn';


// Webcam Image size. Must be 227. 
const IMAGE_SIZE = 227;
// K value for KNN
const TOPK = 10;

const predictionThreshold = 0.98

var words = ["Begin", "Rest"]
// var words = ["ConuHacks", "hello", "what is", "the weather", "the time",
//"add","eggs","to the list","five","feet","in meters","tell me","a joke", "bye", "other"]


// words from above array which act as terminal words in a sentence
var endWords = ["hello"]

class LaunchModal {
  constructor(){
    this.modalWindow = document.getElementById('launchModal')

    this.closeBtn = document.getElementById('close-modal')

    this.closeBtn.addEventListener('click', (e) => {
      this.modalWindow.style.display = "none"
    })

    window.addEventListener('click', (e) => {
      if(e.target == this.modalWindow){
        this.modalWindow.style.display = "none"
      }
    })

    this.modalWindow.style.display = "block"
    this.modalWindow.style.zIndex = 500
  }
}


class Main {
  constructor(){
    // Initiate variables
    this.infoTexts = [];
    this.training = -1; // -1 when no class is being trained
    this.videoPlaying = false;

    this.previousPrediction = -1
    this.currentPredictedWords = []

    // variables to restrict prediction rate
    this.now;
    this.then = Date.now()
    this.startTime = this.then;
    this.fps = 5; //framerate - number of prediction per second
    this.fpsInterval = 1000/(this.fps); 
    this.elapsed = 0;

    this.trainingListDiv = document.getElementById("training-list")
    this.exampleListDiv = document.getElementById("example-list")
    
    this.knn = null

    this.textLine = document.getElementById("text")
    
    // Get video element that will contain the webcam image
    this.video = document.getElementById('video');

    this.addWordForm = document.getElementById("add-word")

    this.video.addEventListener('mousedown', () => {
      // click on video to go back to training buttons
      main.pausePredicting();
      this.trainingListDiv.style.display = "block"
    })

    // add word to training example set
    this.addWordForm.addEventListener('submit', (e) => {
      e.preventDefault();
      let word = document.getElementById("new-word").value.trim().toLowerCase();
      let checkbox = document.getElementById("is-terminal-word")

      if(word && !words.includes(word)){
        //console.log(word)
        words.splice(words.length-1,0,word) //insert at penultimate index in array
        this.createButtonList(false)
        this.updateExampleCount()
        //console.log(words)
        

        if(checkbox.checked){
          endWords.push(word)
        }

        document.getElementById("new-word").value = ''
        checkbox.checked = false;

        // console.log(words)
        // console.log(endWords)

      } else {
        alert("Duplicate word or no word entered")
      }

      return
    })

    // show modal window
    //let modal = new LaunchModal()

    this.updateExampleCount()

    document.getElementById("status").style.display = "none"

    this.createTrainingBtn()
    
    this.createButtonList(false)
    
    // load text to speech
    this.tts = new TextToSpeech()

  }

  createPredictBtn(){
    var div = document.getElementById("action-btn")
    div.innerHTML = ""
    const predButton = document.createElement('button')

    predButton.innerText = "Start Prediction"
    div.appendChild(predButton);

    predButton.addEventListener('mousedown', () => {
      console.log("start predicting")
      const exampleCount = this.knn.getClassExampleCount()

      // check if training has been done
      if(Math.max(...exampleCount) > 0){

        // if wake word has not been trained
        if(exampleCount[0] == 0){
          alert(
            `You haven't added examples for the wake word Begin`
            )
          return
        }

        // if the catchall phrase other hasnt been trained
        if(exampleCount[words.length-1] == 0){
          alert(
            `You haven't added examples for the catchall sign OTHER.\n\nCapture yourself in idle states e.g hands by your side, empty background etc.\n\nThis prevents words from being erroneously detected.`)
          return
        }

        // check if atleast one terminal word has been trained
        if(!this.areTerminalWordsTrained(exampleCount)){
          alert(
            `Add examples for atleast one terminal word.\n\nA terminal word is a word that appears at the end of a query and is necessary to trigger transcribing. e.g What is *the weather*\n\nYour terminal words are: ${endWords}`
            )
          return
        }

        this.trainingListDiv.style.display = "none"
        this.textLine.classList.remove("intro-steps")
        this.textLine.innerText = ""
        this.startPredicting()
      } else {
        alert(
          `You haven't added any examples yet.\n\nPress and hold on the "Add Example" button next to each word while performing the sign in front of the webcam.`
          )
      }
    })
  }

  createTrainingBtn(){
    var div = document.getElementById("action-btn")
    div.innerHTML = ""

    const trainButton = document.createElement('button')
    trainButton.innerText = "Start Training"
    div.appendChild(trainButton);


    trainButton.addEventListener('mousedown', () => {

      // check if user has added atleast one terminal word
      if(words.length > 3 && endWords.length == 1){
        console.log('no terminal word added')
        alert(`You have not added any terminal words.\nCurrently the only query you can make is "Begin, hello".\n\nA terminal word is a word that will appear in the end of your query.\nIf you intend to ask "What's the weather" & "What's the time" then add "the weather" and "the time" as terminal words. "What's" on the other hand is not a terminal word.`)
        return
      }

      if(words.length == 3 && endWords.length ==1){
        var proceed = confirm("You have not added any words.\n\nThe only query you can currently make is: 'Begin, hello'")

        if(!proceed) return
      }

      this.startWebcam()

      var tts = new TextToSpeech()
      console.log("ready to train")
      this.createButtonList(true)
      this.addWordForm.innerHTML = ''
      let p = document.createElement('p')
      this.addWordForm.appendChild(p)
      
      this.loadKNN()

      this.createPredictBtn()

      this.textLine.innerText = ""

      let subtext = document.createElement('span')
      subtext.innerHTML = "" 
      subtext.classList.add('subtext')
      this.textLine.appendChild(subtext)

    })
  }

  areTerminalWordsTrained(exampleCount){

    var totalTerminalWordsTrained = 0

    for(var i=0;i<words.length;i++){
      if(endWords.includes(words[i])){
        if(exampleCount[i] > 0){
          totalTerminalWordsTrained+=1
        }
      }
    }

    return totalTerminalWordsTrained
  }

  startWebcam(){
    // Setup webcam
    navigator.mediaDevices.getUserMedia({video: {facingMode: 'user'}, audio: false})
    .then((stream) => {
      this.video.srcObject = stream;
      this.video.width = IMAGE_SIZE;
      this.video.height = IMAGE_SIZE;

      this.video.addEventListener('playing', ()=> this.videoPlaying = true);
      this.video.addEventListener('paused', ()=> this.videoPlaying = false);
    })
  }

  loadKNN(){

    this.knn = new KNNImageClassifier(words.length, TOPK);

    // Load knn model
    this.knn.load()
    .then(() => this.startTraining()); 
  }

  updateExampleCount(){
    var p = document.getElementById('count')
    //p.innerText = `Training: ${words.length} words`
  }

  createButtonList(showBtn){
    //showBtn - true: show training btns, false:show only text

    // Clear List
    this.exampleListDiv.innerHTML = ""

    // Create training buttons and info texts    
    for(let i=0;i<words.length; i++){
      this.createButton(i, showBtn)
    }
  }

  createButton(i, showBtn){
    const div = document.createElement('div');
    this.exampleListDiv.appendChild(div);
    div.style.marginBottom = '10px';
    
    // Create Word Text
    const wordText = document.createElement('span')

    if(i==0 && !showBtn){
      wordText.innerText = words[i].toUpperCase()+" (wake word) "
    } else if(i==words.length-1 && !showBtn){
      wordText.innerText = words[i].toUpperCase()+" (catchall sign) "
    } else {
      wordText.innerText = words[i].toUpperCase()+" "
      wordText.style.fontWeight = "bold"
    }
    
    
    div.appendChild(wordText);

    if(showBtn){
      // Create training button
      const button = document.createElement('button')
      button.innerText = "Add Example"//"Train " + words[i].toUpperCase()
      div.appendChild(button);

      // Listen for mouse events when clicking the button
      button.addEventListener('mousedown', () => this.training = i);
      button.addEventListener('mouseup', () => this.training = -1);

      // Create clear button to emove training examples
      const btn = document.createElement('button')
      btn.innerText = "Clear"//`Clear ${words[i].toUpperCase()}`
      div.appendChild(btn);

      btn.addEventListener('mousedown', () => {
        console.log("clear training data for this label")
        this.knn.clearClass(i)
        this.infoTexts[i].innerText = " 0 "
      })
      
      // Create info text
      const infoText = document.createElement('span')
      infoText.innerText = " 0 examples";
      div.appendChild(infoText);
      this.infoTexts.push(infoText);
    }
  }
  
  startTraining(){
    if (this.timer) {
      this.stopTraining();
    }
    var promise = this.video.play();

    if(promise !== undefined){
      promise.then(_ => {
        console.log("Autoplay started")
      }).catch(error => {
        console.log("Autoplay prevented")
      })
    }
    this.timer = requestAnimationFrame(this.train.bind(this));
  }
  
  stopTraining(){
    this.video.pause();
    cancelAnimationFrame(this.timer);
  }
  
  train(){
    if(this.videoPlaying){
      // Get image data from video element
      const image = dl.fromPixels(this.video);
      
      // Train class if one of the buttons is held down
      if(this.training != -1){
        // Add current image to classifier
        this.knn.addImage(image, this.training)
      }

      const exampleCount = this.knn.getClassExampleCount()

      if(Math.max(...exampleCount) > 0){
        for(let i=0;i<words.length;i++){
          if(exampleCount[i] > 0){
            this.infoTexts[i].innerText = ` ${exampleCount[i]}`
          }
        }
      }
    }
    this.timer = requestAnimationFrame(this.train.bind(this));
  }

  startPredicting(){
    // stop training
    if(this.timer){
      this.stopTraining();
    }

    document.getElementById("status").style.background = "deepskyblue"

    this.video.play();

    this.pred = requestAnimationFrame(this.predict.bind(this))
  }

  pausePredicting(){
    console.log("pause predicting")
    cancelAnimationFrame(this.pred)
  }

  predict(){
    this.now = Date.now()
    this.elapsed = this.now - this.then

    if(this.elapsed > this.fpsInterval){

      this.then = this.now - (this.elapsed % this.fpsInterval)

      if(this.videoPlaying){
        const exampleCount = this.knn.getClassExampleCount();

        const image = dl.fromPixels(this.video);

        if(Math.max(...exampleCount) > 0){
          this.knn.predictClass(image)
          .then((res) => {
            for(let i=0;i<words.length;i++){

              // if matches & is above threshold & isnt same as prev prediction
              // and is not the last class which is a catch all class
              if(res.classIndex == i 
                && res.confidences[i] > predictionThreshold 
                && res.classIndex != this.previousPrediction
                && res.classIndex != words.length-1){
                  
                this.tts.speakWord(words[i])


                // set previous prediction so it doesnt get called again
                this.previousPrediction = res.classIndex;


              }
            }
          })
          .then(() => image.dispose())
        } else {
          image.dispose()
        }
      }
    }

    this.pred = requestAnimationFrame(this.predict.bind(this))
  }



}

class TextToSpeech{
  constructor(){
    this.synth = window.speechSynthesis
    this.voices = []
    this.pitch = 1.0
    this.rate = 0.9

    this.textLine = document.getElementById("text")
    this.ansText = document.getElementById("answerText")
    this.loader = document.getElementById("loader")

    this.selectedVoice = 7 // this is Google-US en. Can set voice and language of choice

    this.currentPredictedWords = []
    this.waitTimeForQuery = 5000

    this.synth.onvoiceschanged = () => {
      this.populateVoiceList()
    }
    
  }

  populateVoiceList(){
    if(typeof speechSynthesis === 'undefined'){
      console.log("no synth")
      return
    }
    this.voices = speechSynthesis.getVoices()
      
    if(this.voices.indexOf(this.selectedVoice) > 0){
      console.log(`${this.voices[this.selectedVoice].name}:${this.voices[this.selectedVoice].lang}`)
    } else {
      //alert("Selected voice for speech did not load or does not exist.\nCheck Internet Connection")
    }
    
  }

  clearPara(queryDetected){
    this.textLine.innerText = '';
    this.ansText.innerText = ''
    if(queryDetected){
      this.loader.style.display = "block"
    } else {
      this.loader.style.display = "none"
      this.ansText.innerText = "No query detected"
      main.previousPrediction = -1
    }
    this.currentPredictedWords = []
  }

  speakWord(word){

    if(word == 'Begin'){
      console.log("clear para")
      this.clearPara(true);
      setTimeout(() => {
        // if no query detected after ConuHacks is signed
        if(this.currentPredictedWords.length == 1){
          this.clearPara(false)
        }
      }, this.waitTimeForQuery)
    } 

    if(word != 'Begin' && this.currentPredictedWords.length == 0){
      console.log("first word should be ConuHacks")
      console.log(word)
      return
    }

    if(this.currentPredictedWords.includes(word)){
      // prevent word from being detected repeatedly in phrase
      console.log("word already been detected in current phrase")
      return
    }

    this.currentPredictedWords.push(word)

    if(word != 'Begin') {
          this.textLine.innerText += ' ' + word;
      } else {
          this.textLine.innerText = '- ';
      }


    var utterThis = new SpeechSynthesisUtterance(word)

    utterThis.onend = (evt) => {
      if(endWords.includes(word)){
         //if last word is one of end words start listening for transcribing
        console.log("this was the last word")

        let stt = new SpeechToText()
      }
    }

    utterThis.onerror = (evt) => {
      console.log("Error speaking")
    }

    utterThis.voice = this.voices[this.selectedVoice]

    utterThis.pitch = this.pitch
    utterThis.rate = this.rate
    utterThis.lang = this.lang  
    this.synth.speak(utterThis)

  }


}


var main = null;

window.addEventListener('load', () => {

  var ua = navigator.userAgent.toLowerCase()

  if(!(ua.indexOf("chrome") != -1 || ua.indexOf("firefox")!= -1)){
    alert("Please visit in the latest Chrome or Firefox")
    return
  } 


  main = new Main()

});
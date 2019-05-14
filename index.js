import express from 'express';
var Gpio = require('onoff').Gpio; 
const i2c = require('i2c-bus');

var LED = new Gpio(25, 'out'); 
var LedR = new Gpio(5, 'out'); 
var LedG = new Gpio(6, 'out'); 
var LedB = new Gpio(13, 'out'); 
var pushButton = new Gpio(21, 'in', 'both');
var request="";
var blinkInterval;
var temp;
var ReadTempSensor1=0;


const app  = express();
const PORT = 3000;
var server = app.listen(PORT);
var io = require('socket.io').listen(server);
var InputType="";

const record = require('node-record-lpcm16');
const Speaker = require('speaker');
const path = require('path');
const GoogleAssistant = require('google-assistant');
const speakerHelper = require('./examples/speaker-helper');

const fs = require('fs');
let rawdata = fs.readFileSync('./loginMQTT.json');  
let jsondata = JSON.parse(rawdata);   
var mqttHandler = require('./examples/mqtt_handler');
var mqttClient = new mqttHandler(jsondata);
mqttClient.connect(jsondata);

const TC74_ADDR = 0b1001000;


const config = {
  auth: {
    keyFilePath: path.resolve(__dirname, '/home/pi/Downloads/client_secret_77242431490-ioc2e07e06825hl7samhc1u27vpsitnf.apps.googleusercontent.com.json'),
    // where you want the tokens to be saved
    // will create the directory if not already there
    savedTokensPath: path.resolve(__dirname, '/home/pi/express/express-app/token.json'),
  },
  // this param is optional, but all options will be shown
  conversation: {
    audio: {
      encodingIn: 'LINEAR16', // supported are LINEAR16 / FLAC (defaults to LINEAR16)
      sampleRateIn: 16000, // supported rates are between 16000-24000 (defaults to 16000)
      encodingOut: 'LINEAR16', // supported are LINEAR16 / MP3 / OPUS_IN_OGG (defaults to LINEAR16)
      sampleRateOut: 24000, // supported are 16000 / 24000 (defaults to 24000)
    },
    lang: 'en-US', // language code for input/output (defaults to en-US)
    textQuery: undefined,
  },
};

const assistant = new GoogleAssistant(config.auth);
 
// starts a new conversation with the assistant
const startConversation = (conversation) => {
  // setup the conversation and send data to it
  // for a full example, see `examples/mic-speaker.js`
 console.log('Say something!');
  
  conversation
    // send the audio buffer to the speaker
    .on('audio-data', (data) => {
      speakerHelper.update(data);
      console.log(data) ;
    })
    // done speaking, close the mic
    .on('end-of-utterance', () => record.stop())
    // just to spit out to the console what was said (as we say it)
    .on('transcription', data => {
      console.log('Transcription:', data.transcription, ' --- Done:', data.done);
      if(data.done==true)
        request = data.transcription;
    })
    // what the assistant said back
    .on('response', text => {
      if(text!="")
      {
        if(ReadTempSensor1==1)
        {
          io.emit('message',{Request : request,Response : text + temp});
          ReadTempSensor1=0;
        }
        else
        {
          console.log('Assistant Text Response:', text);
          io.emit('message',{Request : request,Response : text});
        }

      }
      else 
        io.emit('message',{Request : request,Response : "can you say it again"});         
    })
    // if we've requested a volume level change, get the percentage of the new level
    
    .on('volume-percent', percent => console.log('New Volume Percent:', percent))
    // the device needs to complete an action
    .on('device-action', action => {
      console.log(action.inputs[0].payload.commands[0].execution[0].command);
      console.log(action.inputs[0].payload.commands[0].execution[0].params);
      var command=action.inputs[0].payload.commands[0].execution[0].command;
      var params =action.inputs[0].payload.commands[0].execution[0].params;
      if(command=='com.example.commands.LEDcolor')
      {
         LedColorAction(params);
      }
      if(command=='com.example.commands.mydevices')
      {
         mydevicesAction(params);
      }
      if(command=='com.example.commands.BlinkLight')
      {
        BlinkLightAction(params);
      }
      if(command=='com.example.commands.TemperatureHome')
      {
        if(params.device=="TEMP SENSOR")
        {
          ReadTempSensor1=1;
          displayTemperature();
        }
      }
      

    })
    // once the conversation is ended, see if we need to follow up

    .on('ended', (error, continueConversation) => {
      if (error) console.log('Conversation Ended Error:', error);
      else if (continueConversation) {
       }
      else {
      console.log('Conversation Complete');

     }
    })
    // catch any errors
    .on('error', (error) => {
      record.stop();
      console.log('Conversation Error:', error);
    });

  if(InputType=="Speech")  
  {
    // pass the mic audio to the assistant
    const mic = record.start({ threshold: 0.5, silence: 1.0,verbose: true, recordProgram: 'arecord', device: 'plughw:1,0' });
    mic.on('data', data => 
    {
      conversation.write(data);
    });
  }
  
  
  // setup the speaker
  const speaker = new Speaker({
    channels: 1,
    sampleRate: config.conversation.audio.sampleRateOut,
  });
  speakerHelper.init(speaker);
  speaker
    .on('open', () => {
      console.log('Assistant Speaking');
      speakerHelper.open();
    })
    .on('close', () => {
      console.log('Assistant Finished Speaking');
    });
  };

const promptForInput = (pData) => {  
      InputType="Text";
      config.conversation.textQuery = pData;
      assistant.start(config.conversation);
      config.conversation.textQuery=undefined;
};

pushButton.watch(function (err, value) { //Watch for hardware interrupts on pushButton GPIO, specify callback function
  if (err) { //if an error
    console.error('There was an error', err); //output error message to console
  return;
  }
  console.log(value);
  if(value==1)
  {
    InputType="Speech";
    assistant.start(config.conversation);
  }
});

const LedColorAction = (params) => { 
  if(params.device=='RGB LED')
  {
    switch(params.color) {
      case 'blue':
        LedR.writeSync(0); //set pin state to 0 (turn LED off)
        LedG.writeSync(0); //set pin state to 0 (turn LED off)
        LedB.writeSync(1); //set pin state to 1 (turn LED on)
        break;
      case 'red':
        LedR.writeSync(1); //set pin state to 1 (turn LED on)
        LedG.writeSync(0); //set pin state to 0 (turn LED off)
        LedB.writeSync(0); //set pin state to 0 (turn LED off)
        break;
      case 'green':
        LedR.writeSync(0); //set pin state to 0 (turn LED off)
        LedG.writeSync(1); //set pin state to 1 (turn LED on)
        LedB.writeSync(0); //set pin state to 0 (turn LED off)
        break;  
      case 'yellow':
        LedR.writeSync(1); //set pin state to 1 (turn LED on)
        LedG.writeSync(1); //set pin state to 1 (turn LED on)
        LedB.writeSync(0); //set pin state to 0 (turn LED off)
        break;  
      case 'white':
        LedR.writeSync(1); //set pin state to 1 (turn LED on)
        LedG.writeSync(1); //set pin state to 1 (turn LED on)
        LedB.writeSync(1); //set pin state to 1 (turn LED on)
        break;  
      default:
        LedR.writeSync(0); //set pin state to 0 (turn LED off)
        LedG.writeSync(0); //set pin state to 0 (turn LED off)
        LedB.writeSync(0); //set pin state to 0 (turn LED off)
        break;  
        // code block
    }
  }
  else console.log("fout device")
}

const mydevicesAction = (params) => {
  var status=0;
  if(params.status=='ON')
    status=1;
  switch(params.device){
    case 'LED1':
      LED.writeSync(status);
      break;
    case 'LED2':break;
    case 'LED3':break;
    case 'RGB LED':
      LedR.writeSync(status); 
      LedG.writeSync(status); 
      LedB.writeSync(status); 
      break;
    default:
      break;
  }
}
const BlinkLightAction = (params) => {
  var Speed;
  var blinkCount=params.number*2;
  switch(params.speed){
    case 'SLOWLY':
      Speed=2000;
      break;
    case 'NORMALLY':
      Speed=1000;
      break;
    case 'QUICKLY':
      Speed=500;
      break;
  }
  
  switch(params.device){
    case 'LED1':
    blinkInterval= setInterval(function() {       
        if (LED.readSync() === 0) { //check the pin state, if the state is 0 (or off)
          LED.writeSync(1);
          console.log("aan");
        } else {
        LED.writeSync(0);
        console.log("af");
        }
        blinkCount--;
        if (blinkCount==0) {
            clearInterval(blinkInterval);
        }
      }, Speed);
      break;
    case 'LED2':break;
    case 'LED3':break;
    case 'RGB LED':
      blinkInterval= setInterval(function() {       
        if (LedB.readSync() === 0 && LedG.readSync() === 0 && LedR.readSync() === 0) { //check the pin state, if the state is 0 (or off)
          LedR.writeSync(1); 
          LedG.writeSync(1); 
          LedB.writeSync(1);
        } else {
          LedR.writeSync(0); 
          LedG.writeSync(0); 
          LedB.writeSync(0);
        }
        blinkCount--;
        if (blinkCount==0) {
            clearInterval(blinkInterval);
        }
      }, Speed);
      setTimeout(function() {
        LedR.writeSync(1); 
        LedG.writeSync(1); 
        LedB.writeSync(1);
      }, Speed);
      setTimeout(function() {
        LedR.writeSync(0); 
        LedG.writeSync(0); 
        LedB.writeSync(0);
      }, Speed);
      break;
    default:
      break;
  }
}

const displayTemperature = () => {
  const i2c1 = i2c.openSync(1);
  temp=i2c1.readByteSync(TC74_ADDR, 0)+"°C"
  i2c1.closeSync();
  mqttClient.sendMessage(temp);
};

// setup the assistant
assistant
.on('ready', () => {
})
.on('started', startConversation)
.on('error', (error) => {
  console.log('Assistant Error:', error);
});


app.get('/', function(req, res,next) {
    res.sendFile(__dirname + '/index.html');
});

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', function (socket) {
  socket.on('textInput', function(data) { 
    request=data;
    promptForInput(data);
  });
  socket.on('Speech', function(data) { 
    InputType="Speech";
    assistant.start(config.conversation);  
  });
  
});

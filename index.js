//#region INIT, REQUIRE, CONFIG
import express from 'express';

const app = express();
const port = 3000;
const { hostname } = require('os');

const record = require('node-record-lpcm16');
const Speaker = require('speaker');
const path = require('path');
const GoogleAssistant = require('google-assistant');
const speakerHelper = require('./examples/speaker-helper');

const i2c = require('i2c-bus');
const TC74_ADDR = 0b1001000;

var Gpio = require('onoff').Gpio;
var LED = new Gpio(25, 'out');
var LedR = new Gpio(5, 'out');
var LedG = new Gpio(6, 'out');
var LedB = new Gpio(13, 'out');
var pushButton = new Gpio(21, 'in', 'both');

var readTempSensor = false;
var blinkInterval;
var temperature;
var IsSpeech;
var request;

var server = app.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
});
var io = require('socket.io').listen(server, () => {
    console.log('socket.io running on server');
});

const fs = require('fs');
let rawdata = fs.readFileSync('./loginMQTT.json');
let jsondata = JSON.parse(rawdata);
var mqttHandler = require('./examples/mqtt_handler');
var mqttClient = new mqttHandler(jsondata);
mqttClient.connect();

const config = {
    auth: {
        keyFilePath: path.resolve(__dirname, '/home/pi/Downloads/client_secret.json'),
        savedTokensPath: path.resolve(__dirname, '/home/pi/express/express-app/token.json'),
    },
    conversation: {
        audio: {
            encodingIn: 'LINEAR16',
            sampleRateIn: 16000,
            encodingOut: 'LINEAR16',
            sampleRateOut: 24000,
        },
        lang: 'en-US',
        textQuery: undefined
    }
};
//#endregion INIT, REQUIRE, CONFIG

//#region ACTIONS
const ComExampleCommandsMyDevices = (params) => {
    var status = params.status == 'ON' ? 1 : 0;
    switch (params.device) {
        case 'LED1':
            LED.writeSync(status);
        break;
        case 'RGB LED':
            LedR.writeSync(status);
            LedG.writeSync(status);
            LedB.writeSync(status);
        break;
        default:
        break;
    }
}

const ComExampleCommandsTemperatureHome = (params) => {
    if (params.device == 'TEMP SENSOR') {
        readTempSensor = true;
        const i2c1 = i2c.openSync(1);
        temperature = i2c1.readByteSync(TC74_ADDR, 0) + '°C';
        i2c1.closeSync();
        mqttClient.sendMessage(temperature);
    }
}

const ComExampleCommandsBlinkLight = (params) => {
    var Speed;
    var blinkCount = params.number * 2;
    
    switch (params.speed) {
        case 'SLOWLY':
            Speed = 2000;
        break;
        case 'NORMALLY':
            Speed = 1000;
        break;
        case 'QUICKLY':
            Speed = 500;
        break;
        default:
        break;
    }
    
    switch (params.device) {
        case 'LED1':
            blinkInterval = setInterval(function() {
                if (LED.readSync() === 0) {
                    LED.writeSync(1);
                    console.log('aan');
                }
                else {
                    LED.writeSync(0);
                    console.log('af');
                }

                blinkCount--;
                if (blinkCount == 0) {
                    clearInterval(blinkInterval);
                }
            }, Speed);
        break;
        case 'RGB LED':
            blinkInterval = setInterval(function() {
                if (LedB.readSync() === 0 && LedG.readSync() === 0 && LedR.readSync() === 0) {
                    LedR.writeSync(1);
                    LedG.writeSync(1);
                    LedB.writeSync(1);
                }
                else {
                    LedR.writeSync(0);
                    LedG.writeSync(0);
                    LedB.writeSync(0);
                }

                blinkCount--;
                if (blinkCount == 0) {
                    clearInterval(blinkInterval);
                }
            }, Speed);

            setTimeout(function() {
                LedR.writeSync(1);
                LedG.writeSync(1);
                LedB.writeSync(1);
            }, Speed);

            setTimeout(function () {
                LedR.writeSync(0);
                LedG.writeSync(0);
                LedB.writeSync(0);
            }, Speed);
        break;
        default:
        break;
    }
}
    
const ComExampleCommandsLEDColor = (params) => {
    if (params.device == 'RGB LED') {
        switch (params.color) {
            case 'blue':             
                LedR.writeSync(0);
                LedG.writeSync(0);
                LedB.writeSync(1);
            break;
            case 'red':
                LedR.writeSync(1);
                LedG.writeSync(0);
                LedB.writeSync(0);
            break;
            case 'green':
                LedR.writeSync(0);
                LedG.writeSync(1);
                LedB.writeSync(0);
            break;
            case 'yellow':
                LedR.writeSync(1);
                LedG.writeSync(1);
                LedB.writeSync(0);
            break;
            case 'white':
                LedR.writeSync(1);
                LedG.writeSync(1);
                LedB.writeSync(1);
            break;
            default:
                LedR.writeSync(0);
                LedG.writeSync(0);
                LedB.writeSync(0);
            break;
        }        
    }    
    else console.log('fout device')
}
//#endregion ACTIONS

//#region START CONVERSATION
// starts a new conversation with the assistant
const startConversation = (conversation) => {
    console.log('Say something!');
    
    //#region CONVERSATION
    // setup the conversation
    conversation
    .on('audio-data', (data) => {
        // send the audio buffer to the speaker
        speakerHelper.update(data);
    })
    .on('end-of-utterance', () => {
        // done speaking, close the mic
        record.stop();
    })
    .on('transcription', (data) => {
        // just to spit out to the console what was said (as we say it)
        console.log('Transcription:', data.transcription, ' --- Done:', data.done);
        if (data.done == true) {
            request = data.transcription;
        }
    })
    .on('response', (text) => {
        // what the assistant said back
        if (text != '') {
            if (readTempSensor) {
                console.log('Assistant Text Response:', "The temperature is:" + temperature);
                io.emit('message', { Request: request, Response: "The temperature is: " + temperature });
                readTempSensor = false;
            }
            else {
                console.log('Assistant Text Response:', text);
                io.emit('message', { Request: request, Response: text });
            }
        }
        else {
            if(request!="")
            io.emit('message', { Request: request, Response: "Sorry, I didn't get that. Can you say it again?" });
        }
        request="";
    })
    .on('volume-percent', (percent) => {
        // if we've requested a volume level change, get the percentage of the new level
        console.log('New Volume Percent:', percent);
    })
    .on('device-action', (action) => {
        // if you've set this device up to handle actions, you'll get that here
        var command = action.inputs[0].payload.commands[0].execution[0].command;
        var params = action.inputs[0].payload.commands[0].execution[0].params;
        console.log(command);
        console.log(params);
        switch (command) {
            case 'com.example.commands.MyDevices':
                ComExampleCommandsMyDevices(params);
            break;
            case 'com.example.commands.TemperatureHome':
                ComExampleCommandsTemperatureHome(params);
            break;
            case 'com.example.commands.BlinkLight':
                ComExampleCommandsBlinkLight(params);
            break;
            case 'com.example.commands.LEDColor':
                console.log('blue');
                ComExampleCommandsLEDColor(params);
            break;
            default:
            break;
        }
    })
    .on('ended', (error, continueConversation) => {
            // once the conversation is ended, see if we need to follow up
            if (error) {
                console.log('Conversation Ended Error:', error);
            }
            else {
                console.log('Conversation Complete');
            }
        })
    .on('error', (error) => {
        // catch any errors
        record.stop();
        console.log(config.conversation.textQuery);
        console.log('Conversation Error:', error);
    })
    //#endregion CONVERSATION

    //#region MIC
    // pass the mic audio to the assistant
    if (IsSpeech) {
        const mic = record.start({
            threshold: 0.5,
            silence: 1.0,
            verbose: true,
            recordProgram: 'arecord',
            device: 'plughw:1,0'
        });
        mic.on('data', data => {
            conversation.write(data);
        });
    }
    //#endregion MIC
    
    //#region SPEAKER
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
    })
    //#endregion SPEAKER
};
//#endregion START CONVERSATION

//#region TEXT INPUT
const promptForInput = (data) => {
    IsSpeech = false;
    config.conversation.textQuery = data;
    assistant.start(config.conversation);
    config.conversation.textQuery = undefined;
};
//#endregion TEXT INPUT

//#region SPEECH INPUT
// Watch for hardware interrupts on pushButton GPIO, specify callback function
pushButton.watch(function (err, value) {
    // if an error
    if (err) {
        //output error message to console
        console.error('There was an error', err);
        return;
    }
    console.log(value);
    if (value == 1) {
        IsSpeech = true;
        assistant.start(config.conversation);
    }
});
//#endregion SPEECH INPUT

//#region ASSISTANT
// setup the assistant
const assistant = new GoogleAssistant(config.auth);
assistant
.on('started', startConversation)
.on('error', (error) => {
    console.log('Assistant Error:', error);
})
//#endregion ASSISTANT

//#region SERVER
app.get('/', (req, res, next) => {
    res.sendFile(__dirname + '/index.html');
});

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    socket.on('textInput', (data) => {
        request = data;
        promptForInput(data);
    });
    socket.on('IsSpeech', (checked) => {
        IsSpeech = checked;
        assistant.start(config.conversation);
    });
});
//#endregion SERVER

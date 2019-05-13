import express from 'express';
const app = express();
const PORT = 3000;
var server = app.listen(PORT);
var io = require('socket.io').listen(server);

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
var request = "";
var IsSpeech;
var blinkInterval;
var temperature;

var mqttHandler = require('./examples/mqtt_handler');
var mqttClient = new mqttHandler();
mqttClient.connect();

const config = {
    auth: {
        keyFilePath: path.resolve(__dirname, '/home/pi/Downloads/client_secret.json'),
        savedTokensPath: path.resolve(__dirname, '/home/pi/express/express-app/token.json'),
    },
    conversation: {
        audio: {
            encodingIn: 'LINEAR16',     // supported are LINEAR16 / FLAC (defaults to LINEAR16)
            sampleRateIn: 16000,        // supported rates are between 16000-24000 (defaults to 16000)
            encodingOut: 'LINEAR16',    // supported are LINEAR16 / MP3 / OPUS_IN_OGG (defaults to LINEAR16)
            sampleRateOut: 24000,       // supported are 16000 / 24000 (defaults to 24000)
        },
        lang: 'en-US',                  // language code for input/output (defaults to en-US)
        textQuery: undefined
    }
};

const assistant = new GoogleAssistant(config.auth);

// starts a new conversation with the assistant
const startConversation = (conversation) => {
    // setup the conversation and send data to it
    // for a full example, see `examples/mic-speaker.js`
    console.log('Say something!');

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
            if (text != "") {
                if (readTempSensor) {
                    console.log('Assistant Text Response:', text + temperature);
                    io.emit('message', { Request: request, Response: text + temperature });
                    readTempSensor = false;
                }
                else {
                    console.log('Assistant Text Response:', text);
                    io.emit('message', { Request: request, Response: text });
                }
            }
            else {
                io.emit('message', { Request: request, Response: "Sorry, I didn't get that. Can you say it again?" });
            }
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
                    ComExampleCommandsLEDColor(params);
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

    if (IsSpeech) {
        // pass the mic audio to the assistant
        const mic = record.start({ threshold: 0.5, silence: 1.0, verbose: true, recordProgram: 'arecord', device: 'plughw:1,0' });
        mic.on('data', data => {
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
    IsSpeech = false;
    config.conversation.textQuery = pData;
    assistant.start(config.conversation);
    config.conversation.textQuery = undefined;
};

pushButton.watch(function (err, value) { //Watch for hardware interrupts on pushButton GPIO, specify callback function
    if (err) { //if an error
        console.error('There was an error', err); //output error message to console
        return;
    }
    console.log(value);
    if (value == 1) {
        IsSpeech = true;
        assistant.start(config.conversation);
    }
});

const ComExampleCommandsLEDColor = (params) => {
    if (params.device == 'RGB LED') {
        switch (params.color) {
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

const ComExampleCommandsMyDevices = (params) => {
    var status = 0;
    if (params.status == 'ON')
        status = 1;
    switch (params.device) {
        case 'LED1':
            LED.writeSync(status);
            break;
        case 'LED2': break;
        case 'LED3': break;
        case 'RGB LED':
            LedR.writeSync(status);
            LedG.writeSync(status);
            LedB.writeSync(status);
            break;
        default:
            break;
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
    }

    switch (params.device) {
        case 'LED1':
            blinkInterval = setInterval(function () {
                if (LED.readSync() === 0) { //check the pin state, if the state is 0 (or off)
                    LED.writeSync(1);
                    console.log("aan");
                } else {
                    LED.writeSync(0);
                    console.log("af");
                }
                blinkCount--;
                if (blinkCount == 0) {
                    clearInterval(blinkInterval);
                }
            }, Speed);
            break;
        case 'LED2': break;
        case 'LED3': break;
        case 'RGB LED':
            blinkInterval = setInterval(function () {
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
                if (blinkCount == 0) {
                    clearInterval(blinkInterval);
                }
            }, Speed);
            setTimeout(function () {
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

const ComExampleCommandsTemperatureHome = (params) => {
    if (params.device == "TEMP SENSOR") {
        readTempSensor = true;
        const i2c1 = i2c.openSync(1);
        temperature = i2c1.readByteSync(TC74_ADDR, 0) + "°C";
        i2c1.closeSync();
        mqttClient.sendMessage(temperature);
    }
};

// setup the assistant
assistant
    .on('ready', () => {
    })
    .on('started', startConversation)
    .on('error', (error) => {
        console.log('Assistant Error:', error);
    });


app.get('/', function (req, res, next) {
    res.sendFile(__dirname + '/index.html');
});

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', function (socket) {
    socket.on('textInput', function (data) {
        request = data;
        promptForInput(data);
    });
    socket.on('Speech', (checked) => {
        IsSpeech = checked;
        assistant.start(config.conversation);
    });
});

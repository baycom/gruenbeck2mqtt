const util = require("util");
const mqtt = require("mqtt");
const http = require("http");

const commandLineArgs = require("command-line-args");
const xml2js = require("xml2js");
var parser = new xml2js.Parser();
var valtree = {};

const optionDefinitions = [
	{
		name: "host",
		alias: "h",
		type: String,
		defaultValue: "softliQ-SC-ae-36-a1",
	},
	{ name: "id", alias: "i", type: String, defaultValue: "sensors/gruenbeck" },
	{ name: "wait", alias: "w", type: Number, defaultValue: 10 },
	{ name: "debug", alias: "d", type: Boolean, defaultValue: false },
	{ name: "mqtthost", alias: "m", type: String, defaultValue: "ehz-gw" },
	{ name: "mqttclientid", alias: "c", type: String, defaultValue: "gruenbeckClient" },
];

const options = commandLineArgs(optionDefinitions);

console.log("MQTT host     : " + options.mqtthost);
console.log("MQTT Client ID: " + options.id);
console.log("Wait       (s): " + options.wait);
console.log("Gruenbeck host: " + options.host);

function sendMqtt(data) {
	const jsonData = JSON.stringify(data);
	const topic = options.id + "/" + options.host;
	
	if(options.debug) {
		console.log("sendMqtt: " + topic + " Data: " + jsonData);
	}
	MQTTclient.publish(topic, jsonData, { retain: true });
}

var MQTTclient = mqtt.connect("mqtt://" + options.mqtthost, {
	clientId: options.mqttclientid
});
MQTTclient.on("connect", function () {
	console.log("MQTT connected");
});

MQTTclient.on("error", function (error) {
	console.log("Can't connect" + error);
	process.exit(1);
});

function getVariables(id) {
	// An object of options to indicate where to post to
	var post_data =
		"id=" +
		id +
		"&code=245&show=D_A_1_1|D_A_1_2|D_A_3_2|D_K_5|D_Y_1|D_A_1_3|D_Y_5~";
	var post_options = {
		host: options.host,
		port: "80",
		path: "/mux_http",
		method: "POST",
		timeout: 1000,
		insecureHTTPParser: true,
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			"Content-Length": Buffer.byteLength(post_data),
		},
	};
	var post_req = http
		.request(post_options, function (res) {
			let data = "";
			res.setEncoding("utf8");
			res.on("data", (chunk) => {
				data += chunk;
			});

			res.on("end", () => {
				if (options.debug) {
					console.log(util.inspect(data, false, 10));
				}
				parser.parseString(data.toString(), (err, result) => {
					if (err) {
						throw err;
					}
					if (options.debug) {
						console.log(util.inspect(result, false, 10));
					}
					if(result.data) {
						valtree['current_flow'] = result.data['D_A_1_1'] * 1.0;
						valtree['capacity_remain'] = result.data['D_A_1_2'] * 1.0;
						valtree['regeneration_percent'] = result.data['D_A_3_2'] * 1.0;
						valtree['regeneration_step'] = result.data['D_Y_5'] * 1.0;
						valtree['water_consumption'] = result.data['D_Y_1'] * 1.0;
						valtree['capacity_full'] = result.data['D_A_1_3'] * 1.0;
						valtree['chlorine_current'] = result.data['D_K_5'] * 1.0;
						if (Object.keys(valtree).length) {
							if (options.debug) {
								console.log(util.inspect(valtree));
							}
							sendMqtt(valtree);
						}
					}
				});
				setTimeout(timer, options.wait * 1000, id);
			});
		})
		.on("error", (err) => {
			console.log("Error: " + err.message);
			setTimeout(timer, options.wait * 1000, id);
		});
	post_req.write(post_data);
	post_req.end();
}

function timer(id) {
	getVariables(id);
}

timer(Math.floor(Math.random() * 32767));

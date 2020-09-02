#!/bin/sh
':' //; exec "$(command -v nodejs || command -v node)" "$0" "$@"
"use strict";

//parse command line
if (process.argv.length != 4) {
	console.error("Usage:\nknitout-to-kcode.js <in.knitout> <out.kc>");
	process.exitCode = 1;
	return;
}
let knitoutFile = process.argv[2];
let kcFile = process.argv[3];

//------------------------------------

const fs = require('fs');

//BedNeedle helps store needles:

function BedNeedle(bed, needle) {
	if (arguments.length == 1 && typeof(arguments[0]) === 'string') {
		let str = arguments[0];
		let m = str.match(/^([fb]s?)(-?\d+)$/);
		if (!m) {
			throw "ERROR: invalid needle specification '" + str + "'.";
		}
		this.bed = m[1];
		this.needle = parseInt(m[2]);
	} else if (arguments.length == 2 && typeof(arguments[0]) === 'string' && typeof(arguments[1]) === 'number') {
		this.bed = arguments[0];
		this.needle = arguments[1];
	} else {
		throw "Don't know how to construct a BedNeedle from the given arguments";
	}
}

BedNeedle.prototype.toString = function() {
	return this.bed + this.needle;
};

BedNeedle.prototype.isFront = function(){
	if (this.bed === 'f' || this.bed === 'fs') return true;
	else if (this.bed === 'b' || this.bed === 'bs') return false;
	else throw "Invalid bed in BedNeedle.";
};

BedNeedle.prototype.isBack = function(){
	if (this.bed === 'f' || this.bed === 'fs') return false;
	else if (this.bed === 'b' || this.bed === 'bs') return true;
	else throw "Invalid bed in BedNeedle.";
};

BedNeedle.prototype.isHook = function(){
	if (this.bed === 'f' || this.bed === 'b') return true;
	else if (this.bed === 'fs' || this.bed === 'bs') return false;
	else throw "Invalid bed in BedNeedle.";
};

BedNeedle.prototype.isSlider = function(){
	if (this.bed === 'fs' || this.bed === 'bs') return true;
	else if (this.bed === 'f' || this.bed === 'b') return false;
	else throw "Invalid bed in BedNeedle.";
};

//Carrier objects store information about each carrier:
function Carrier(name) {
	this.name = name;
	this.last = null; //last stitch -- {needle:, direction:} -- or null if not yet brought in
	this.kick = null; //last kick -- {needle:, direction:}
	this.in = null; //the "in" operation that added this to the active set. (format: {op:"in", cs:["", "", ...]})
}

//TODO change these constants to ascii kcode values
//map is stitch.leading => stitch number
//NOTE: this is the opposite of how the 'stitch' op does it (leading, stitch).
//NOTE: this doesn't do anything with 'YG', also what is YG?
//NOTE: this should probably be read out of a .999 file of some sort
const STITCH_NUMBERS = {
	'10.-10':81,
	'10.0': 82,
	'10.10':83,
	'15.5': 84,
	'15.10':85,
	'15.15':86,
	'20.10':87,
	'20.15':88,
	'20.20':89,
	'25.15':90,
	'25.20':91,
	'25.25':92,
	'30.25':93,
	'35.25':94,
	'40.25':95,
	'45.25':96,
	'50.25':97,
	'55.25':98,
	'60.25':99,
	'65.25':100
};

//these give the expected range of stopping distances:
const MIN_STOPPING_DISTANCE = 10;
const MAX_STOPPING_DISTANCE = 20;

//special op, turns into a MISS if slot is unoccupied, or merges with knit/tuck/etc.
const OP_SOFT_MISS = {color:16};

const OP_MISS_FRONT = {color:216 /*bed:'f'*/}; //116 == front miss (with links process), 216 == front miss (independent carrier movement)
const OP_MISS_BACK  = {color:217 /*bed:'b'*/}; //117 == back miss (with links process), 217 == back miss (independent carrier movement)
//NOTE: this code sometimes uses 216/217 without independent carrier movement, at that seems to be okay(?!?)

const OP_TUCK_FRONT = {color:11, isFront:true /*bed:'f'*/};
const OP_TUCK_BACK	= {color:12, isBack:true /*bed:'b'*/};

const OP_KNIT_FRONT = {color:51, isFront:true /*bed:'f'*/};
const OP_KNIT_BACK	= {color:52, isBack:true /*bed:'b'*/};

//combo ops:
const OP_KNIT_FRONT_KNIT_BACK = {color:3, isFront:true, isBack:true};
const OP_KNIT_FRONT_TUCK_BACK = {color:41, isFront:true, isBack:true};
const OP_KNIT_FRONT_MISS_BACK = {color:OP_KNIT_FRONT.color, isFront:true};
const OP_TUCK_FRONT_KNIT_BACK = {color:42, isFront:true, isBack:true};
const OP_TUCK_FRONT_TUCK_BACK = {color:88, isFront:true, isBack:true};
const OP_TUCK_FRONT_MISS_BACK = {color:OP_TUCK_FRONT.color, isFront:true};
const OP_MISS_FRONT_KNIT_BACK = {color:OP_KNIT_BACK.color, isBack:true};
const OP_MISS_FRONT_TUCK_BACK = {color:OP_TUCK_BACK.color, isBack:true};
const OP_MISS_FRONT_MISS_BACK = {color:16};

const OP_XFER_TO_BACK = {color:20};
const OP_XFER_TO_FRONT = {color:30};

const OP_SPLIT_TO_BACK = {color:101};
const OP_SPLIT_TO_FRONT = {color:102};

const OP_SPLIT_FRONT_TO_FRONT_VIA_SLIDER_L1 = {color:106};
const OP_SPLIT_FRONT_TO_FRONT_VIA_SLIDER_R1 = {color:107};
const OP_SPLIT_BACK_TO_BACK_VIA_SLIDER_L1 = {color:108};
const OP_SPLIT_BACK_TO_BACK_VIA_SLIDER_R1 = {color:109};

const OP_SPLIT_FRONT_TO_FRONT_VIA_SLIDER_L2 = {color:126};
const OP_SPLIT_FRONT_TO_FRONT_VIA_SLIDER_R2 = {color:127};
const OP_SPLIT_BACK_TO_BACK_VIA_SLIDER_L2 = {color:128};
const OP_SPLIT_BACK_TO_BACK_VIA_SLIDER_R2 = {color:129};

const OP_SPLIT_FRONT_TO_FRONT_VIA_SLIDER_L4 = {color:146};
const OP_SPLIT_FRONT_TO_FRONT_VIA_SLIDER_R4 = {color:147};
const OP_SPLIT_BACK_TO_BACK_VIA_SLIDER_L4 = {color:148};
const OP_SPLIT_BACK_TO_BACK_VIA_SLIDER_R4 = {color:149};


//return a combined operation that does 'a' then 'b' (moving right), or null of such a thing doesn't exist
function merge_ops(a,b,quarterPitch) {
	//soft miss will always be replaced by another operation in the same slot:
	if (a === OP_SOFT_MISS) {
		return b;
	} else if (b === OP_SOFT_MISS) {
		return a;
	}
	//see if a/b fit one of the combo ops:
	if (!quarterPitch) return null; //can't merge front/back ops without quarter pitch racking
	if (a === OP_MISS_FRONT) {
		if      (b === OP_MISS_BACK) return OP_MISS_FRONT_MISS_BACK;
		else if (b === OP_TUCK_BACK) return OP_MISS_FRONT_TUCK_BACK;
		else if (b === OP_KNIT_BACK) return OP_MISS_FRONT_KNIT_BACK;
	} else if (a === OP_TUCK_FRONT) {
		if      (b === OP_MISS_BACK) return OP_TUCK_FRONT_MISS_BACK;
		else if (b === OP_TUCK_BACK) return OP_TUCK_FRONT_TUCK_BACK;
		else if (b === OP_KNIT_BACK) return OP_TUCK_FRONT_KNIT_BACK;
	} else if (a === OP_KNIT_FRONT) {
		if      (b === OP_MISS_BACK) return OP_KNIT_FRONT_MISS_BACK;
		else if (b === OP_TUCK_BACK) return OP_KNIT_FRONT_TUCK_BACK;
		else if (b === OP_KNIT_BACK) return OP_KNIT_FRONT_KNIT_BACK;
	}
	//I guess they can't be combined:
	return null;
}

//different pass types:
const TYPE_KNIT_TUCK = 'knit-tuck';
const TYPE_A_MISS = 'a-miss';
const TYPE_SPLIT = 'split';
const TYPE_SPLIT_VIA_SLIDERS = 'split-via-sliders';
const TYPE_XFER = 'xfer';
const TYPE_XFER_TO_SLIDERS = 'xfer-to-sliders';
const TYPE_XFER_FROM_SLIDERS = 'xfer-from-sliders';

//different pass yarn hook actions:
const HOOK_IN = 'hook-in'; //bring in yarn using hook before pass starts (GRIPPER_IN must also be set)
const HOOK_RELEASE = 'hook-release'; //release yarn from hook *before the pass starts* (tested on machine)
const HOOK_OUT = 'hook-out'; //bring yarn out using hook after pass ends (GRIPPER_OUT must also be set)

//different pass yarn gripper actions:
const GRIPPER_IN = 'gripper-in'; //bring yarn in from gripper (inhook will also set HOOK_IN)
const GRIPPER_OUT = 'gripper-out'; //bring yarn out to gripper (outhook will also set HOOK_OUT)

//pass directions:
const DIRECTION_LEFT = '-';
const DIRECTION_RIGHT = '+';
const DIRECTION_NONE = '';

//Pass stores information about a single machine pass:
function Pass(info) {
	//type: one of the TYPE_* constants (REQUIRED)
	//racking: number giving racking (REQUIRED)
	//stitch: number giving stitch (REQUIRED)
	//slots: raster index -> operation
	//direction: one of the DIRECTION_* constants
	//carriers: array of carriers, possibly of zero length
	//hook: one of the HOOK_* constants or undefined
	//gripper: one of the GRIPPER_* constants or undefined
	//presserMode: 'off', 'on', or 'auto'
	['type', 'slots', 'direction', 'carriers', 'hook', 'gripper', 'racking', 'pause', 'stitch', 'speed', 'presserMode'].forEach(function(name){
		if (name in info) this[name] = info[name];
	}, this);
	if (!('slots' in this)) this.slots = {};
	if (!('carriers' in this)) this.carriers = [];

	//Check that specification was reasonable:
	console.assert('type' in this, "Can't specify a pass without a type.");
	console.assert('racking' in this, "Can't specify a pass without a racking.");
	console.assert('stitch' in this, "Can't specify a pass without a stitch value.");
	console.assert('speed' in this, "Can't specify a pass without a speed value.");

	if (this.type === TYPE_KNIT_TUCK) {
		if ('gripper' in this) {
			console.assert(this.carriers.length !== 0, "Using GRIPPER_* with no carriers doesn't make sense.");
			if (this.gripper === GRIPPER_IN) {
				console.assert(!('hook' in this) || this.hook === HOOK_IN, "Must use GRIPPER_IN with HOOK_IN.");
			} else if (this.gripper === GRIPPER_OUT) {
				console.assert(!('hook' in this) || this.hook === HOOK_OUT, "Must use GRIPPER_OUT with HOOK_OUT.");
			} else {
				console.assert(false, "Pass gripper must be one of the GRIPPER_* constants.");
			}
		}
		if ('hook' in this) {
			if (this.hook === HOOK_IN) {
				console.assert(this.carriers.length !== 0, "Using HOOK_IN with no carriers doesn't make sense.");
			} else if (this.hook === HOOK_RELEASE) {
				//HOOK_RELEASE can work with any carriers
			} else if (this.hook === HOOK_OUT) {
				console.assert(this.carriers.length !== 0, "Using HOOK_OUT with no carriers doesn't make sense.");
			} else {
				console.assert(false, "Pass hook must be one of the HOOK_* constants.");
			}
		}
	} else if (this.type === TYPE_SPLIT || this.type == TYPE_SPLIT_VIA_SLIDERS) {
		//not clear if these are actually restrictions:
		console.assert(!('gripper' in this), "Must use gripper only on KNIT_TUCK pass.");
		console.assert(!('hook' in this), "Must use hook only on KNIT_TUCK pass.");
		console.assert(this.carriers.length > 0, "Split passes should have yarn.");
	} else if (this.type === TYPE_XFER || this.type === TYPE_XFER_TO_SLIDERS || this.type === TYPE_XFER_FROM_SLIDERS) {
		console.assert(!('gripper' in this), "Must use gripper only on KNIT_TUCK pass.");
		console.assert(!('hook' in this), "Must use hook only on KNIT_TUCK pass.");
		console.assert(this.carriers.length === 0, "Transfer passes cannot have carriers specified.");
		console.assert(!('presserMode' in this), "Transfer passes cannot have a presser mode.");
	} else {
		console.assert(false, "Pass type must be one of the TYPE_* constants.");
	}

	if (this.type == TYPE_SPLIT_VIA_SLIDERS) {
		this.pendingReturn = {};
	}
}

Pass.prototype.hasFront = function() {
	console.assert(this.type === TYPE_KNIT_TUCK, "It only makes sense to ask knit-tuck passes if they have front stitches.");
	for (let s in this.slots) {
		if ('isFront' in this.slots[s]) return true;
	}
	return false;
};
Pass.prototype.hasBack = function() {
	console.assert(this.type === TYPE_KNIT_TUCK, "It only makes sense to ask knit-tuck passes if they have back stitches.");
	for (let s in this.slots) {
		if ('isBack' in this.slots[s]) return true;
	}
	return false;
};

//'append' attempts to append a second pass to this pass.
//NOTE: only written for passes that actually perform operations, not for adding options.
Pass.prototype.append = function(pass) {

	//---- check if merge would work ----

	//pauses can't stack:
	if (pass.pause) {
		return false;
	}

	//some properties must match exactly:
	if (!['type', 'racking', 'stitch', 'speed', 'direction', 'carriers'].every(function(name){
		return JSON.stringify(this[name]) === JSON.stringify(pass[name]);
	}, this)) {
		return false;
	}

	//Make sure presser mode matches (TODO: cold probably be more clever about merging 'auto' and 'on'/'off' passes):
	if (('presserMode' in this) && ('presserMode' in pass) && this.presserMode !== pass.presserMode) {
		return false;
	}
	if (this.presserMode === 'on') {
		console.assert(!(this.hasFront() && this.hasBack()), "Presser mode can't be on in a mixed front/back pass.");
		if (this.hasFront() && pass.hasBack()) return false;
		if (this.hasBack() && pass.hasFront()) return false;
		if (pass.hook) return false;
	}

	//it is okay to merge hook operations in a few cases:
	if (!('hook' in this) && !('hook' in pass)) {
		//hook in neither is fine
	} else if ((this.hook === HOOK_IN || this.hook == HOOK_RELEASE) && !('hook' in pass)) {
		//in or release at the start of the current pass is fine
	} else if (!('hook' in this) && pass.hook === HOOK_OUT) {
		//out or release at the end of the next pass is fine
	} else {
		//hook operations are in conflict
		return false;
	}

	//it is okay to merge gripper operations in a few cases:
	if (!('gripper' in this) && !('gripper' in pass)) {
		//gripper in neither is fine
	} else if (this.gripper === GRIPPER_IN && !('gripper' in pass)) {
		//in at the start of the current pass is fine
	} else if (!('gripper' in this) && pass.gripper === GRIPPER_OUT) {
		//out at the end of the next pass is fine
	} else {
		//gripper operations are in conflict
		return false;
	}

	//must have a free slot for the new operation(s):
	let quarterPitch = (this.racking - Math.floor(this.racking) != 0.0);
	if (this.direction === DIRECTION_RIGHT) {
		//new operation needs to be to the right of other operations.
		let max = -Infinity;
		for (let s in this.slots) {
			max = Math.max(max, parseInt(s));
		}
		for (let s in pass.slots) {
			s = parseInt(s);
			if (s < max) {
				return false;
			} else if (s === max) {
				if (merge_ops(this.slots[s], pass.slots[s], quarterPitch) === null) {
					//needles are offset, but no way to do the current op and then the next op to the right
					return false;
				}
			} else {
				//great!
			}
		}
	} else if (this.direction === DIRECTION_LEFT) {
		//new operation needs to be to the left of other operations.
		let min = Infinity;
		for (let s in this.slots) {
			min = Math.min(min, parseInt(s));
		}
		for (let s in pass.slots) {
			s = parseInt(s);
			if (s > min) {
				return false;
			} else if (s === min) {
				if (merge_ops(pass.slots[s], this.slots[s], quarterPitch) === null) {
					//needles are offset, but no way to do the current op and then the next op to the left
					return false;
				}
			} else {
				//great!
			}
		}
	} else { console.assert(this.direction === DIRECTION_NONE, "Direction '" + this.direction + "' must be one of the DIRECTION_* constants.");
		for (let s in pass.slots) {
			if (s in this.slots) {
				//TODO: can one drop both front and back with aligned racking?
				if (merge_ops(this.slots[s], pass.slots[s], quarterPitch) === null
				 && merge_ops(pass.slots[s], this.slots[s], quarterPitch) === null) {
					//no way to merge operations in the same slot
					return false;
				}
			}
		}

	}

	//---- actually merge next pass ----

	//merge presserMode:
	if ('presserMode' in pass) {
		this.presserMode = pass.presserMode;
	}

	//merge hook properties:
	if (!('hook' in this) && ('hook' in pass)) {
		this.hook = pass.hook;
	} else {
		console.assert(!('hook' in pass), "we checked this");
	}
	//merge gripper properties:
	if (!('gripper' in this) && ('gripper' in pass)) {
		this.gripper = pass.gripper;
	} else {
		console.assert(!('gripper' in pass), "we checked this");
	}

	//merge slots:
	for (let s in pass.slots) {
		if (s in this.slots) {
			if (this.direction === DIRECTION_RIGHT) {
				this.slots[s] = merge_ops(this.slots[s], pass.slots[s], quarterPitch);
				console.assert(this.slots[s] !== null, "we pre-checked this");
			} else if (this.direction === DIRECTION_LEFT) {
				this.slots[s] = merge_ops(pass.slots[s], this.slots[s], quarterPitch);
				console.assert(this.slots[s] !== null, "we pre-checked this");
			} else { console.assert(this.direction === DIRECTION_NONE, "Direction must be one of the DIRECTION_* constants.");
				let op = merge_ops(this.slots[s], pass.slots[s], quarterPitch);
				if (op === null) {
					op = merge_ops(pass.slots[s], this.slots[s], quarterPitch);
				}
				this.slots[s] = op;
				console.assert(this.slots[s] !== null, "we pre-checked this");
			}
		} else {
			this.slots[s] = pass.slots[s];
		}
	}


	return true;
};

//read from file:
let headers = {};
let passes = [];

(function knitoutToPasses() {
	//load file, split on lines:
	let lines = fs.readFileSync(knitoutFile, 'utf8').split('\n');
	let lineIdx = 0;

	//check for windows-style line endings:
	let complainAboutLineEndings = false;
	for (let i = 0; i < lines.length; ++i) {
		if (lines[i].endsWith('\r')) {
			lines[i] = lines[i].substr(0, lines[i].length-1);
			complainAboutLineEndings = true;
		}
	}
	if (complainAboutLineEndings) {
		console.warn("WARNING: File contains some '\\r\\n'-style line endings, this is not specification-compliant.");
	}

	(function checkVersion(){
		let m = lines[lineIdx].match(/^;!knitout-(\d+)$/);
		if (!m) {
			throw "File starts with '" + lines[0] + "', which is not a valid knitout magic string";
		}
		if (parseInt(m[1]) > 2) {
			console.warn("WARNING: File is version " + m[1] + ", but this code only knows about versions up to 2.");
		}
		++lineIdx;
	})();

	(function readHeaders(){
		//read header lines at the start of the file:
		for (; lineIdx < lines.length; ++lineIdx) {
			let line = lines[lineIdx];

			//comment headers must start with ';;':
			if (!line.startsWith(';;')) break;

			//comment headers must include the string ': ':
			let idx = line.indexOf(': ');
			if (idx === -1) {
				console.warn("Comment-header-like line '" + line + "' does not contain string ': ' -- interpreting as regular comment.");
				break;
			}
			let header = line.substr(2, idx-2);
			let value = line.substr(idx+2);

			if (header in headers) console.warn("WARNING: header '" + header + "' specified more than once. Will use last value.");
			if        (header === 'Carriers') {
				headers.Carriers = value.split(/[ ]+/); //this is slightly generous -- the spec says "space-separated" not "whitespace-separated"
			} else if (header === 'Machine') {
				headers.Machine = value; //TODO: check value
			} else if (header.startsWith('Yarn-')) {
				//TODO: check that carrier name is valid
			} else if (header === 'Gauge') {
				if (/^\d+\.?\d*$/.test(value) && parseFloat(value) > 0) {
					headers.Gauge = parseFloat(value);
				} else {
					throw "ERROR: Guage header's value ('" + value + "') should be a number greater than zero.";
				}
			} else if (header === 'Width') {
				if (/^\d+$/.test(value) && parseInt(value) > 0) {
					headers.Width = parseInt(value);
				} else {
					throw "ERROR: Width header's value should be a positive integer.";
				}
			} else if (header === 'Position') {
				if (["Left", "Right", "Keep", "Center"].indexOf(value) !== -1) {
					headers.Position = value;
				} else {
					throw "ERROR: Positon header's value should be 'Left', 'Right', 'Keep', or 'Center'.";
				}
			} else {
				console.warn("WARNING: File contains unknown comment header '" + header + "'.");
			}
		} //for (lines)

		//'Carriers:' header is required
		if (!('Carriers' in headers)) {
			throw "ERROR: 'Carriers:' header is required.";
		}

		//This code requires Carriers to be 1 .. 10 in order:
		if (headers.Carriers.join(' ') !== '1 2 3 4 5 6 7 8 9 10') {
			throw "ERROR: 'Carriers:' header must be '1 2 3 4 5 6 7 8 9 10'.";
		}

		//Set default 'Width' if not specified + report current value:
		if (!('Width' in headers)) {
			headers.Width = 540;
			console.log("Width header not specified. Assuming beds are " + headers.Width + " needles wide.");
		} else {
			console.log("Width header indicates beds are " + headers.Width + " needles wide.");
		}

		//Set default 'Position' if not specified + report current value:
		const DESCRIBE_POSITION = {
			"Center" : "center design on needle bed",
			"Keep" : "use needle numbers as written",
			"Left" : "left-justify design on needle bed",
			"Right" : "right-justify design on needle bed",
		};
		if (!('Position' in headers)) {
			headers.Position = 'Center';
			console.log("Position header not specified. Will " + DESCRIBE_POSITION[headers.Position] + " ('" + headers.Position + "').");
		} else {
			console.log("Will " + DESCRIBE_POSITION[headers.Position] + " as per position header '" + headers.Position + "'.");
		}

	})();

	let carriers = {}; //carriers are held in an "name" => object map.
	let hook = null; //holding hook isn't holding anything just now, would {direction:DIRECTION_*, cs:["", "",...]}
	let racking = 0.0; //racking starts centered
	let stitch = 5; //machine-specific stitch number
	let xferStitch = 0; //machine-specific stitch number for transfers; 0 => default
	let speed = 0; //machine-specific speed number
	let presserMode = "off"; //fabric presser mode, one of 'on', 'off', or 'auto'
	let pausePending = false; //optional stop before next instruction, please

	//if doing a split-via-sliders operation, svs looks like:
	let svs = null;
	//svs = {
	//  //source stuff:
	//	cs:[], //carrier(s) being used
	//	needles:{}, //set of needle names that have been split from
	//	racking:1.0, //some (integer) racking
	//	//return stuff (only included if during split-via-sliders):
	//	return:{
	//		needles:{}, //set of needle names that have been returned from
	//		racking:-4.0, //some (integer) racking
	//	}
	//};

	function slotNumber(bn) {
		if (bn.isFront()) {
			return bn.needle;
		} else {
			return bn.needle + Math.floor(racking);
		}
	}
	function slotString(bn) {
		return slotNumber(bn).toString();
	}

	function merge(pass, shouldNotKick) {
		let doPause = pausePending;
		pausePending = false;
		if (passes.length !== 0 && !doPause && passes[passes.length-1].append(pass)) {
			//great; pass was able to merge into existing pass no problem.
		} else {
			//need to start a new pass:

			//If there are carriers, make sure they start on the correct side of the pass:
			//which slot is this pass acting on?
			let passSlot;
			for (let s in pass.slots) {
				console.assert(typeof(passSlot) === 'undefined', "only one slot in pass to merge");
				passSlot = parseInt(s);
			}
			console.assert(typeof(passSlot) !== 'undefined', "exactly one slot in pass to merge");

			//which carriers are on the wrong side of this slot?
			let slotCs = {};
			let haveKick = false;
			function addKick(c, slot) {
				//console.log("  will kick " + c + " relative " + slot); //DEBUG
				if (!(slot in slotCs)) slotCs[slot] = [c];
				else slotCs[slot].push(c);
				haveKick = true;
			}
			pass.carriers.forEach(function(c){
				console.assert(c in carriers, "Carriers in passes should also be in the carrier set.");
				if (carriers[c].last !== null) { //only kick carriers not being brought in
					let kickSlot = slotNumber(carriers[c].kick.needle);
					//console.log(c + " is " + carriers[c].kick.direction + " of " + kickSlot + " (want to act " + pass.direction + " on " + passSlot + ")"); //DEBUG
					if (carriers[c].kick.direction === DIRECTION_LEFT) {
						//carrier is somewhere (one 'stopping distance', modulo racking) left of kickSlot

						//strict version -> "infinite" stopping distance:
						if (pass.direction === DIRECTION_LEFT) {
							//stopping distance might be as much as \infty, definitely need to kick
							addKick(c, kickSlot);
						} else { //pass.direction === DIRECTION_RIGHT
							if (kickSlot > passSlot) { //stopping distance might be as little as zero
								addKick(c, passSlot);
							}
						}
					} else { console.assert(carriers[c].kick.direction === DIRECTION_RIGHT, "carrier directions are only LEFT or RIGHT.");
						//carrier is somewhere (one 'stopping distance', modulo racking) right of carrierSlot

						//strict version -> "infinite" stopping distance:
						if (pass.direction === DIRECTION_RIGHT) {
							//stopping distance might be as much as \infty, definitely need to kick
							addKick(c, kickSlot);
						} else { //pass.direction === DIRECTION_LEFT
							if (kickSlot < passSlot) { //stopping distance might be as little as zero
								addKick(c, passSlot);
							}
						}
					}
				}
			});


			//if kicks are needed, do them recursively:
			if (haveKick) {
				//which direction do carriers need to be kicked?
				let d;
				if (pass.direction === DIRECTION_LEFT) d = DIRECTION_RIGHT;
				else if (pass.direction === DIRECTION_RIGHT) d = DIRECTION_LEFT;
				else console.assert(false, "Passes with carriers have either LEFT or RIGHT direction.");

				for (let slot in slotCs) {
					let info = {
						type:TYPE_KNIT_TUCK,
						slots:{},
						racking:racking,
						stitch:stitch,
						speed:speed,
						carriers:slotCs[slot],
						direction:d
					};
					if (doPause) {
						info.pause = true;
						doPause = false;
					}
					info.slots[slot] = OP_SOFT_MISS;
					merge(new Pass(info), true);

					//console.log("Kicking " + JSON.stringify(slotCs[slot]) + " to the " + d + " of " + slot); //DEBUG

					//update carrier kick info:
					slotCs[slot].forEach(function(c){
						carriers[c].kick = {
							needle:new BedNeedle('f', parseInt(slot)),
							direction:d,
							minDistance:MIN_STOPPING_DISTANCE
						};
					});
				}

				if (doPause) {
					pass.pause = true;
					doPause = false;
				}
				merge(pass, true); //should be fine, now. kicks shouldn't keep kicking...
				return;
			} else {
				//if kicks aren't needed, can just append the pass:
				if (doPause) {
					pass.pause = true;
					doPause = false;
				}
				passes.push(pass);
			}
		}



		//TODO: update last stitch info for carriers *here* instead of ad-hoc elsewhere
		/* something like:
		if (pass.carriers.length > 0) {
			//which slot is this pass acting on?
			let passSlot;
			for (s in pass.slots) {
				console.assert(typeof(passSlot) === 'undefined', "only one slot in pass to merge");
				passSlot = parseInt(s);
			}

			cs.forEach(function(c){
				console.assert(c in carriers, "We should have thrown an error already if carrier isn't in carrier set.");
				carriers[c].last = { needle:n, direction:d };
			});
		}
		*/
	}

	//if the carriers not named in 'cs' have last set, kick so they won't overlap n
	function kickOthers(n,cs) {
		let ignore = {};
		cs.forEach(function(c){
			ignore[c] = true;
		});
		let needleSlot = slotNumber(n);
		for (let c in carriers) {
			let carrier = carriers[c];
			if (carrier.name in ignore) continue;
			if (carrier.last === null) continue;
			console.assert(carrier.kick !== null, "last and kick are always set at the same time");

			//where is carrier attached?
			let lastSlot = slotNumber(carrier.last.needle);
			let lastSlotSide = lastSlot;
			if (carrier.last.direction === DIRECTION_LEFT) {
				lastSlotSide -= 0.1;
			} else { console.assert(carrier.last.direction === DIRECTION_RIGHT, "carriers always have direction set to LEFT or RIGHT");
				lastSlotSide += 0.1;
			}

			//relative to what needle was carrier last parked?
			let kickSlot = slotNumber(carrier.kick.needle);
			if (lastSlotSide < needleSlot) {
				//carrier is attached to the left of the needle to be operated, so it needs to be kicked left!
				if (carrier.kick.direction === DIRECTION_LEFT && kickSlot <= needleSlot) {
					//Great: carrier is kicked left of something that is as least as far left as the needle
				} else {
					//Otherwise, need to kick left:
					let info = {
						type:TYPE_KNIT_TUCK,
						slots:{},
						racking:racking,
						stitch:stitch,
						speed:speed,
						carriers:[carrier.name],
						direction:DIRECTION_LEFT
					};
					info.slots[slotString(carrier.last.needle)] = OP_SOFT_MISS;

					merge(new Pass(info));

					carrier.kick.direction = DIRECTION_LEFT;
					carrier.kick.needle = new BedNeedle('f', lastSlot);
				}
			} else { console.assert(lastSlotSide > needleSlot, "lastSlotSide will be fractional, so must be > or < needleSlot");
				//carrier is attached to the right of the needle to be operated, so it needs to be kicked right
				if (carrier.kick.direction === DIRECTION_RIGHT && kickSlot >= needleSlot) {
					//Great: carrier is kicked right of something that is as least as far right as the needle
				} else {
					//Otherwise, need to kick right:
					let info = {
						type:TYPE_KNIT_TUCK,
						slots:{},
						racking:racking,
						stitch:stitch,
						speed:speed,
						carriers:[carrier.name],
						direction:DIRECTION_RIGHT
					};
					info.slots[slotString(carrier.last.needle)] = OP_SOFT_MISS;

					merge(new Pass(info));

					carrier.kick.direction = DIRECTION_RIGHT;
					carrier.kick.needle = new BedNeedle('f', lastSlot);
				}
			}
		}
	}

	//if carriers in 'cs' are marked to in, and add proper gripper/hook ops to info and unmark them:
	function handleIn(cs, info) {
		if (cs.length === 0) return;
		let inInfo = null;
		cs.forEach(function(c){
			if (!(c in carriers)) throw "ERROR: using a carrier (" + c + ") that isn't active.";
			if (carriers[c].in) {
				inInfo = carriers[c].in;
				carriers[c].in = null;
			}
		});
		if (inInfo) {
			if (JSON.stringify(inInfo.cs) !== JSON.stringify(cs)) throw "ERROR: first use of carriers " + JSON.stringify(cs) + " doesn't match in info " + JSON.stringify(inInfo);
			if (inInfo.op === 'in') {
				info.gripper = GRIPPER_IN;
			} else if (inInfo.op === 'inhook') {
				info.gripper = GRIPPER_IN;
				info.hook = HOOK_IN;
				if (hook !== null) throw "ERROR: can't bring in " + JSON.stringify(cs) + " with hook; hook is holding " + JSON.stringify(hook.cs) + ".";
				hook = {direction:info.direction, cs:cs.slice()}; //record that these are being held.
			} else {
				console.assert(false, "inInfo.op must be 'in' or 'inhook'");
			}
		}
	}

	//update the '.last' member of the given carriers:
	function setLast(cs, d, n) {
		console.assert(typeof(n) === 'object', "setLast needs a needle.");
		cs.forEach(function(c){
			console.assert(c in carriers, "We should have thrown an error already if carrier isn't in carrier set.");
			//last -- where carrier is attached
			//kick -- where carrier is parked
			carriers[c].last = { needle:n, direction:d };
			carriers[c].kick = { needle:n, direction:d, minDistance:MIN_STOPPING_DISTANCE };
		});
	}

	//read the remaining lines in the file:
	for ( ; lineIdx < lines.length; ++lineIdx) {
		let line = lines[lineIdx];

		//strip comments:
		let i = line.indexOf(';');
		if (i >= 0) line = line.substr(0, i);
		//tokenize:
		let tokens = line.split(/[ ]+/);
		//trim potentially empty first and last tokens:
		if (tokens.length > 0 && tokens[0] === "") tokens.shift();
		if (tokens.length > 0 && tokens[tokens.length-1] === "") tokens.pop();

		if (tokens.length == 0) continue; //empty line, skip

		let op = tokens.shift();
		let args = tokens;
		let expectNoCarriers = false;

		//Handle synonyms:
		if (op === 'amiss') {
			op = 'tuck';
			args.unshift('+');
			expectNoCarriers = true;
		} else if (op === 'drop') {
			op = 'knit';
			args.unshift('+');
			expectNoCarriers = true;
		} else if (op === 'xfer') {
			op = 'split';
			args.unshift('+');
			expectNoCarriers = true;
		}

		function throwIfSVS() {
			if (svs) {
				throw "Can't '" + op + "' -- splits-via-slider are pending.";
			}
		}
		
		//Handle operations:
		if (op === 'in' || op === 'inhook') {
			throwIfSVS();
			let cs = args;
			if (cs.length === 0) throw "ERROR: Can't bring in no carriers";

			cs.forEach(function(c){
				if (headers.Carriers.indexOf(c) === -1) {
					throw "ERROR: Can't use carrier '" + c + "' which isn't named in the Carriers comment header.";
				}
			});

			cs.forEach(function(c){
				if (c in carriers) throw "ERROR: Can't bring in carrier '" + c + "' -- it is already active.";
			});

			let inInfo = {op:op, cs:cs.slice()};
			//mark all carriers as pending:
			cs.forEach(function(c){
				let carrier = new Carrier(c);
				carrier.in = inInfo;
				carrier.used_hook = (op === 'inhook');
				carriers[c] = carrier;
			});
		} else if (op === 'releasehook') {
			throwIfSVS();
			let cs = args;
			if (hook === null) {
				throw "ERROR: Can't releasehook on " + cs + ", hook currently empty.";
			} else if (JSON.stringify(hook.cs) !== JSON.stringify(cs)) {
				throw "ERROR: Can't releasehook on " + cs + ", hook currently holds " + hook + ".";
			}

			cs.forEach(function(c){
				carriers[c].used_hook = false;
			});

			let needPass = true;
			//HOOK_RELEASE on the machine releases *before* the pass, so must start a new pass always (always):
			/*
			if (passes.length > 0) {
				let prev = passes[passes.length-1];
				if (prev.type === TYPE_KNIT_TUCK && !('hook' in prev) && prev.direction === hook.direction) {
					prev.hook = HOOK_RELEASE;
					needPass = false;
				}
			}*/
			if (needPass) {
				//can we put in a pass that does *nothing* and release hook on it?
				//... well, we can try, at least:
				let info = {
					type:TYPE_KNIT_TUCK,
					direction:hook.direction,
					carriers:[], //Ideally, there should be some way to say "use whatever carriers happen to appear in the hook.direction-going pass it doesn't matter", but for now we'll use no carriers because otherwise unnecessary kicks happen
					racking:racking,
					stitch:stitch,
					speed:speed,
					hook:HOOK_RELEASE,
					slots:{}
				};
				info.slots[slotString(carriers[cs[0]].last.needle)] = OP_SOFT_MISS;
			
				// knit paint refuses to release hook on a carriage move pass (R5 = 2)
				// add a dummy pass to avoid carriage move in the release hook pass
				if(passes[passes.length - 1].direction === info.direction){
					let dummy = {
						type:TYPE_KNIT_TUCK,
						direction: hook.direction === DIRECTION_LEFT ? DIRECTION_RIGHT : DIRECTION_LEFT,
						carriers:[],
						racking:racking,
						stitch:stitch,
						speed:speed,
						slots:{}
					};
					dummy.slots[slotString(carriers[cs[0]].last.needle)] = OP_SOFT_MISS;
					passes.push(new Pass(dummy));
				}
				
				passes.push(new Pass(info));
				//merge(new Pass(info)); merge will fail anyway
			}
			//and hook is back to holding nothing:
			hook = null;
		} else if (op === 'out' || op === 'outhook') {
			throwIfSVS();
			let cs = args;
			
			cs.forEach(function(c){
				if (!(c in carriers)) throw "ERROR: Can't bring out carrier '" + c + "' -- it isn't yet active.";
				if (!carriers[c].last) throw "ERROR: Can't bring out carrier '" + c + "' -- it hasn't yet stitched.";
				if (op === 'out' && carriers[c].used_hook) throw "ERROR: Can't out carriers " + carriers[c].name + ", hook release pending " + JSON.stringify(hook.cs) + "."; 
			});

			if (op === 'outhook' && hook !== null) throw "ERROR: Can't outhook carriers " + cs + ", hook is already holding " + JSON.stringify(hook.cs) + ".";

			//make a pass with (at least) a single rightward miss from which to take the carrier set out:
			let s = -Infinity;
			let n = null;
			cs.forEach(function(c){
				let t = slotNumber(carriers[c].last.needle);
				if (t > s) {
					s = t;
					n = carriers[c].last.needle;
				}
			});
			let info = {
				type:TYPE_KNIT_TUCK,
				slots:{},
				racking:racking,
				stitch:stitch,
				speed:speed,
				carriers:cs,
				direction:DIRECTION_RIGHT,
				gripper:GRIPPER_OUT,
			};
			info.slots[slotString(n)] = OP_SOFT_MISS;

			if (op === 'outhook') info.hook = HOOK_OUT;

			merge(new Pass(info));

			//remove carriers from active set:
			cs.forEach(function(c){
				delete carriers[c];
			});
		} else if (op === 'rack') {
			if (args.length !== 1) throw "ERROR: racking takes one argument.";
			if (!/^[+-]?\d*\.?\d+$/.test(args[0])) throw "ERROR: racking must be a number.";
			let newRacking = parseFloat(args.shift());
			let frac = newRacking - Math.floor(newRacking);
			if (frac != 0.0 && frac != 0.25) throw "ERROR: rackings must be an integer or an integer + 0.25";
			racking = newRacking;
		} else if (op === 'stitch') {
			throwIfSVS();
			if (args.length !== 2) throw "ERROR: stitch takes two arguments.";
			if (!/^[+-]?\d+$/.test(args[0]) || !/^[+-]?\d+$/.test(args[1])) throw "ERROR: stitch arguments must be integers.";
			let newLeading = parseInt(args.shift());
			let newStitch = parseInt(args.shift());

			let key = newStitch + '.' + newLeading;
			if (!(key in STITCH_NUMBERS)) {
				console.log("Stitch number table:");
				console.log(STITCH_NUMBERS);
				throw "ERROR: leading " + newLeading + " with stitch " + newStitch + " doesn't appear in stitch number table.";
			}
			stitch = STITCH_NUMBERS[key];
		} else if (op === 'x-presser-mode') {
			throwIfSVS();
			if (args.length !== 1) throw "ERROR: x-presser-mode takes one argument.";
			if (['on', 'off', 'auto'].indexOf(args[0]) === -1) throw "ERROR: x-presser-mode should be one of 'on', 'off', or 'auto'" + " got : " + args[0];
			presserMode = args[0];
		} else if (op === 'x-speed-number') {
			throwIfSVS();
			if (args.length !== 1) throw "ERROR: x-speed-number takes one argument.";
			if (!/^[+]?\d+$/.test(args[0])) throw "ERROR: x-speed-number argument must be non-negative integer.";
			let newSpeedNumber = parseInt(args.shift());
			speed = newSpeedNumber;

		} else if (op === 'x-stitch-number') {
			throwIfSVS();
			if (args.length !== 1) throw "ERROR: x-stitch-number takes one argument.";
			if (!/^[+]?\d+$/.test(args[0])) throw "ERROR: x-stitch-number argument must be non-negative integer.";
			let newStitchNumber = parseInt(args.shift());
			//TODO: perhaps check that stitch number looks valid for machine
			stitch = newStitchNumber;
		} else if (op === 'miss' || op === 'tuck' || op === 'knit') {
			throwIfSVS();
			let d = args.shift();
			let n = new BedNeedle(args.shift());
			let cs = args;

			if (expectNoCarriers && cs.length !== 0) {
				throw "ERROR: cannot amiss/drop with carriers (use tuck/knit).";
			}

			if (cs.length === 0) {
				if (op === 'miss') {
					throw "ERROR: it makes no sense to miss with no yarns.";
				} else {
					d = DIRECTION_NONE; //a-miss and drop are directionless
				}
			}
			if (op === 'miss') {
				//miss doesn't care about other carriers
			} else {
				kickOthers(n,cs); //tuck and knit need carriers out of the way
			}

			let type;
			if (op === 'tuck' && cs.length === 0) {
				type = TYPE_A_MISS; //a-miss is tuck without carriers
			} else {
				type = TYPE_KNIT_TUCK;
			}

			let info = {
				type:type,
				slots:{},
				racking:racking,
				stitch:stitch,
				speed:speed,
				carriers:cs,
				direction:d,
				presserMode:presserMode,
			};

			if      (op === 'miss') info.slots[slotString(n)] = (n.isFront() ? OP_MISS_FRONT : OP_MISS_BACK);
			else if (op === 'tuck') info.slots[slotString(n)] = (n.isFront() ? OP_TUCK_FRONT : OP_TUCK_BACK);
			else if (op === 'knit') info.slots[slotString(n)] = (n.isFront() ? OP_KNIT_FRONT : OP_KNIT_BACK);
			else console.assert(false, "op was miss, tuck, or knit");

			handleIn(cs, info);

			merge(new Pass(info));

			setLast(cs, d, n);

		} else if (op === 'split') {
			let d = args.shift();
			let n = new BedNeedle(args.shift());
			let t = new BedNeedle(args.shift());
			let cs = args;

			if (expectNoCarriers && cs.length !== 0) {
				throw "ERROR: cannot xfer with carriers (use split).";
			}

			//make sure that 't' and 'n' align reasonably:
			if (n.isBack() && t.isFront()) {
				if (n.needle + racking !== t.needle) {
					throw "ERROR: needles '" + n + "' and '" + t + "' are not aligned at racking " + racking + ".";
				}
			} else if (n.isFront() && t.isBack()) {
				if (n.needle !== t.needle + racking) {
					throw "ERROR: needles '" + n + "' and '" + t + "' are not aligned at racking " + racking + ".";
				}
			}

			let op;
			let type;
			//make sure that this is a valid operation, and fill in proper OP:
			if (n.isHook() && t.isHook()) {
				throwIfSVS();
				if (cs.length === 0) {
					type = TYPE_XFER;
					op = (n.isFront() ? OP_XFER_TO_BACK : OP_XFER_TO_FRONT);
				} else {
					type = TYPE_SPLIT;
					op = (n.isFront() ? OP_SPLIT_TO_BACK : OP_SPLIT_TO_FRONT);
				}
			} else if (n.isSlider() && t.isHook()) {
				if (cs.length === 0) {
					if (svs) {
						if (!('returnRacking' in svs)) {
							svs.returnRacking = racking;
							//patch returnRacking into pass:
							console.assert(passes[passes.length-1].type === TYPE_SPLIT_VIA_SLIDERS, "Must have svs pass pending if returning.");
							passes[passes.length-1].returnRacking = racking;
						}
						if (svs.returnRacking !== racking) {
							throw "ERROR: Cannot return at both racking " + svs.returnRacking + " and racking " + racking + ".";
						}
						if (!(n in svs.needles)) {
							throw "ERROR: Split-via-sliders loop at " + n + " does not exist -- was already returned or never split to.";
						}
						delete svs.needles[n];
						if (JSON.stringify(svs.needles) === "{}") {
							//SPLIT_VIA_SLIDERS pass is done(!)
							svs = null;
						}
					} else {
						type = TYPE_XFER_FROM_SLIDERS;
						op = (n.isFront() ? OP_XFER_TO_BACK : OP_XFER_TO_FRONT);
					}
				} else {
					throw "ERROR: cannot split from slider.";
				}
			} else if (n.isHook() && t.isSlider()) {
				if (cs.length === 0) {
					throwIfSVS();
					type = TYPE_XFER_TO_SLIDERS;
					op = (n.isFront() ? OP_XFER_TO_BACK : OP_XFER_TO_FRONT);
				} else {
					//splits are awkward because all of the colors for them *also* include an automatic return from the slider.
					if (!svs) {
						//start a new split-via-sliders:
						svs = { needles:{}, racking:racking };
					}
					if ('returnRacking' in svs) {
						throw "ERROR: Cannot split-to-sliders during return-from-sliders phase.";
					}
					if (svs.racking !== racking) {
						throw "ERROR: Cannot split-to-sliders at both racking " + svs.racking + " and racking " + racking + ".";
					}
					if (t in svs.needles) {
						throw "ERROR: Split-via-sliders loop at " + n + " -> " + t + " has already been split.";
					}
					svs.needles[t] = true;

					type = TYPE_SPLIT_VIA_SLIDERS;
					op = (n.isFront() ? OP_SPLIT_TO_BACK : OP_SPLIT_TO_FRONT);
				}
			} else {
				throw "ERROR: cannot move from slider to slider.";
			}

			if (op) {
				if (cs.length === 0) {
					d = ""; //xfer is directionless
				}
				kickOthers(n,cs); //both xfer and split need carriers out of the way

				let info = {
					type:type,
					slots:{},
					racking:racking,
					stitch:(cs.length === 0 ? xferStitch : stitch),
					speed:speed,
					carriers:cs,
					direction:d,
				};
				info.slots[slotString(n)] = op;
				handleIn(cs, info);

				merge(new Pass(info));

				//update any carrier.last that pointed to this needle -- the stitch just got moved!
				for (let cn in carriers) {
					let c = carriers[cn];
					if (c.last && c.last.needle.bed == n.bed && c.last.needle.needle == n.needle) {
						c.last.needle = new BedNeedle(t.bed, t.needle);
					}
				}
				setLast(cs, d, n);
			}
		} else if (op === 'pause') {
			throwIfSVS();
			if (pausePending) {
				console.warn("WARNING: redundant pause instruction.");
			}
			pausePending = true;
		} else if (op.match(/^x-/)) {
			console.warn("WARNING: unsupported extension operation '" + op + "'.");
		} else {
			throw "ERROR: unsupported operation '" + op + "'.";
		}


	} //for(lines)

	// test that all carriers were taken out
	{
	
		if (!(Object.entries(carriers).length === 0)){
			throw "ERROR: All carriers need to be taken out, out/outhook missing on carriers: " + Object.keys(carriers) + ".";
		}
	}

	//parse knitout to operations
	//for each operation, translate to color index
	//call pass.add(...), if fails, make a new pass and call pass.add(...)
})();

let raster;
//write array of passes into raster
//TODO change this to generate ascii
(function passesToRaster() {
	//NOTE: testing shows that the option lines can be right up against the stopping colors; so we could remove some margin pixels there.
	//padding relative to just the pass slots:
	const LEFT_SPACE = 10 + 20*2 + 5;
	const RIGHT_SPACE = 5 + 20*2 + 10;
	const TOP_SPACE = 1 + 2 + 5;
	const BOTTOM_SPACE = 5;

	let minSlot = Infinity;
	let maxSlot =-Infinity;
	passes.forEach(function(pass){
		for (let s in pass.slots) {
			let si = parseInt(s);
			minSlot = Math.min(minSlot, si);
			maxSlot = Math.max(maxSlot, si);
		}
		console.log(pass);
	});
})();

(function passesToKCode() {
// TODO write ascii output to file
})();

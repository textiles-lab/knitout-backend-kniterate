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

// BedNeedle.prototype.isHook = function(){
// 	if (this.bed === 'f' || this.bed === 'b') return true;
// 	else if (this.bed === 'fs' || this.bed === 'bs') return false;
// 	else throw "Invalid bed in BedNeedle.";
// };

// BedNeedle.prototype.isSlider = function(){
// 	if (this.bed === 'fs' || this.bed === 'bs') return true;
// 	else if (this.bed === 'f' || this.bed === 'b') return false;
// 	else throw "Invalid bed in BedNeedle.";
// };

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
const MIN_STOPPING_DISTANCE = 4;
const MAX_STOPPING_DISTANCE = 6;

//special op, merges with knit/tuck/etc:
const OP_SOFT_MISS = { name:'OP_SOFT_MISS' };

const OP_TUCK_FRONT = { name:'OP_TUCK_FRONT', isFront:true };
const OP_TUCK_BACK  = { name:'OP_TUCK_BACK',  isBack:true };

const OP_KNIT_FRONT = { name:'OP_KNIT_FRONT', isFront:true };
const OP_KNIT_BACK  = { name:'OP_KNIT_BAACK', isBack:true };

//combo ops:
const OP_KNIT_FRONT_KNIT_BACK = { name:'OP_KNIT_FRONT_KNIT_BACK', isFront:true, isBack:true };
const OP_KNIT_FRONT_TUCK_BACK = { name:'OP_KNIT_FRONT_TUCK_BACK', isFront:true, isBack:true };
const OP_KNIT_FRONT_MISS_BACK = { name:'OP_KNIT_FRONT_MISS_BACK', isFront:true };
const OP_TUCK_FRONT_KNIT_BACK = { name:'OP_TUCK_FRONT_KNIT_BACK', isFront:true, isBack:true };
const OP_TUCK_FRONT_TUCK_BACK = { name:'OP_TUCK_FRONT_TUCK_BACK', isFront:true, isBack:true };
const OP_TUCK_FRONT_MISS_BACK = { name:'OP_TUCK_FRONT_MISS_BACK', isFront:true };
const OP_MISS_FRONT_KNIT_BACK = { name:'OP_MISS_FRONT_KNIT_BACK', isBack:true };
const OP_MISS_FRONT_TUCK_BACK = { name:'OP_MISS_FRONT_TUCK_BACK', isBack:true };
const OP_MISS_FRONT_MISS_BACK = { name:'OP_MISS_FRONT_MISS_BACK' };

const OP_XFER_TO_BACK  = { name:'OP_XFER_TO_BACK', isFront:true };
const OP_XFER_TO_FRONT = { name:'OP_XFER_TO_FRONT', isBack:true };

//return a combined operation that does 'a' then 'b' (moving right), or null if such a thing doesn't exist
function merge_ops(a,b,quarterPitch) {
	//soft miss will always be replaced by another operation in the same slot:
	if (a === OP_SOFT_MISS) {
		return b;
	} else if (b === OP_SOFT_MISS) {
		return a;
	}
	//see if a/b fit one of the combo ops:
	if (!quarterPitch) return null; //can't merge front/back ops without quarter pitch racking
	if (a === OP_MISS_FRONT_MISS_BACK) {
		if      (b === OP_MISS_FRONT_MISS_BACK) return OP_MISS_FRONT_MISS_BACK;
		else if (b === OP_MISS_FRONT_TUCK_BACK) return OP_MISS_FRONT_TUCK_BACK;
		else if (b === OP_MISS_FRONT_KNIT_BACK) return OP_MISS_FRONT_KNIT_BACK;
	} else if (a === OP_TUCK_FRONT_MISS_BACK) {
		if      (b === OP_MISS_FRONT_MISS_BACK) return OP_TUCK_FRONT_MISS_BACK;
		else if (b === OP_MISS_FRONT_TUCK_BACK) return OP_TUCK_FRONT_TUCK_BACK;
		else if (b === OP_MISS_FRONT_KNIT_BACK) return OP_TUCK_FRONT_KNIT_BACK;
	} else if (a === OP_KNIT_FRONT_MISS_BACK) {
		if      (b === OP_MISS_FRONT_MISS_BACK) return OP_KNIT_FRONT_MISS_BACK;
		else if (b === OP_MISS_FRONT_TUCK_BACK) return OP_KNIT_FRONT_TUCK_BACK;
		else if (b === OP_MISS_FRONT_KNIT_BACK) return OP_KNIT_FRONT_KNIT_BACK;
	} else if (a === OP_MISS_FRONT_TUCK_BACK) {
		if      (b === OP_MISS_FRONT_MISS_BACK) return OP_MISS_FRONT_TUCK_BACK;
		else if (b === OP_TUCK_FRONT_MISS_BACK) return OP_TUCK_FRONT_TUCK_BACK;
		else if (b === OP_KNIT_FRONT_MISS_BACK) return OP_KNIT_FRONT_TUCK_BACK;
	} else if (a === OP_MISS_FRONT_KNIT_BACK) {
		if      (b === OP_MISS_FRONT_MISS_BACK) return OP_MISS_FRONT_KNIT_BACK;
		else if (b === OP_TUCK_FRONT_MISS_BACK) return OP_TUCK_FRONT_KNIT_BACK;
		else if (b === OP_KNIT_FRONT_MISS_BACK) return OP_KNIT_FRONT_KNIT_BACK;
	}
	//I guess they can't be combined:
	return null;
}
//TO-DO add logic than ensures that pass direction changes if racking is not 0.5 & try to knit i.e. f1 & b1; otherwise, add to pass (assuming other conditions = true)

//different pass types:
//TO-DO define kn-kn etc. here (leave _ and - symbols)
const TYPE_SOFT_MISS = {}; //pass that exists only to host SOFT_MISS stitches, which can merge with knit or tuck passes
const TYPE_KNIT_x = {kcode:'Kn-Kn'};
const TYPE_x_KNIT = {kcode:'Kn-Kn'};
const TYPE_TUCK_x = {kcode:'Tu-Tu'};
const TYPE_x_TUCK = {kcode:'Tu-Tu'};
const TYPE_KNIT_KNIT = {kcode:'Kn-Kn'};
const TYPE_TUCK_KNIT = {kcode:'Tu-Kn'};
const TYPE_KNIT_TUCK = {kcode:'Kn-Tu'};
const TYPE_TUCK_TUCK = {kcode:'Tu-Tu'};

const TYPE_XFER = {front:'Xf', back:'Xf'}; //will actually get split in output

function merge_types(a,b) {
	//same type, easy to merge:
	if (a === b) return a;

	//"soft miss" passes can merge with anything knit- or tuck- like:
	if (a === TYPE_SOFT_MISS) {
		if (b !== TYPE_XFER) return b;
		else return null;
	}
	if (b === TYPE_SOFT_MISS) {
		if (a !== TYPE_XFER) return a;
		else return null;
	}
	
	//types that only define one bed get merged:
	if (a === TYPE_KNIT_x) {
		if      (b === TYPE_x_KNIT) return TYPE_KNIT_KNIT;
		else if (b === TYPE_x_TUCK) return TYPE_KNIT_TUCK;
	} else if (a === TYPE_x_KNIT) {
		if      (b === TYPE_KNIT_x) return TYPE_KNIT_KNIT;
		else if (b === TYPE_TUCK_x) return TYPE_TUCK_KNIT;
	} else if (a === TYPE_TUCK_x) {
		if      (b === TYPE_x_KNIT) return TYPE_TUCK_KNIT;
		else if (b === TYPE_x_TUCK) return TYPE_TUCK_TUCK;
	} else if (a === TYPE_x_TUCK) {
		if      (b === TYPE_KNIT_x) return TYPE_KNIT_TUCK;
		else if (b === TYPE_TUCK_x) return TYPE_TUCK_TUCK;
	}

	//return 'null' if no merge possible:
	return null;
}

//different pass yarn gripper actions:
const GRIPPER_IN = 'gripper-in'; //bring yarn in from gripper
const GRIPPER_OUT = 'gripper-out'; //bring yarn out to gripper

//pass directions:
const DIRECTION_LEFT = '-';
const DIRECTION_RIGHT = '+';
const DIRECTION_NONE = '';

//Pass stores information about a single machine pass:
function Pass(info) {
	//type: one of the TYPE_* constants (REQUIRED)
	//racking: number giving racking (REQUIRED)
	//slots: raster index -> operation
	//direction: one of the DIRECTION_* constants
	//carriers: array of carriers, possibly of zero length
	//gripper: one of the GRIPPER_* constants or undefined
	['type', 'slots', 'direction', 'carriers', 'gripper', 'racking', 'pause', 'speed'].forEach(function(name){
		if (name in info) this[name] = info[name];
	}, this);
	if (!('slots' in this)) this.slots = {};
	if (!('carriers' in this)) this.carriers = [];

	//Check that specification was reasonable:
	console.assert('type' in this, "Can't specify a pass without a type.");
	console.assert('racking' in this, "Can't specify a pass without a racking.");
	console.assert('speed' in this, "Can't specify a pass without a speed value.");

  //TO-DO pass sanity check
	// if (this.type === TYPE_KNIT_TUCK) {
	// 	if ('gripper' in this) {
	// 		console.assert(this.carriers.length !== 0, "Using GRIPPER_* with no carriers doesn't make sense.");
	// 		if (this.gripper === GRIPPER_IN) {
	// 			console.assert(!('hook' in this) || this.hook === HOOK_IN, "Must use GRIPPER_IN with HOOK_IN.");
	// 		} else if (this.gripper === GRIPPER_OUT) {
	// 			console.assert(!('hook' in this) || this.hook === HOOK_OUT, "Must use GRIPPER_OUT with HOOK_OUT.");
	// 		} else {
	// 			console.assert(false, "Pass gripper must be one of the GRIPPER_* constants.");
	// 		}
	// 	}
	// } else if (this.type === TYPE_SPLIT || this.type == TYPE_SPLIT_VIA_SLIDERS) {
	// 	//not clear if these are actually restrictions:
	// 	console.assert(!('gripper' in this), "Must use gripper only on KNIT_TUCK pass.");
	// 	console.assert(!('hook' in this), "Must use hook only on KNIT_TUCK pass.");
	// 	console.assert(this.carriers.length > 0, "Split passes should have yarn.");
	// } else if (this.type === TYPE_XFER || this.type === TYPE_XFER_TO_SLIDERS || this.type === TYPE_XFER_FROM_SLIDERS) {
	// 	console.assert(!('gripper' in this), "Must use gripper only on KNIT_TUCK pass.");
	// 	console.assert(!('hook' in this), "Must use hook only on KNIT_TUCK pass.");
	// 	console.assert(this.carriers.length === 0, "Transfer passes cannot have carriers specified.");
	// } else {
	// 	console.assert(false, "Pass type must be one of the TYPE_* constants.");
	// }

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
	if (!['racking', 'stitch', 'speed', 'direction', 'carriers'].every(function(name){
		return JSON.stringify(this[name]) === JSON.stringify(pass[name]);
	}, this)) {
		return false;
	}

	//pass types must be merge-able:
	if (merge_types(this.type, pass.type) === null) {
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
	//TO-DO change to halfPitch <-- actually this is okay, I think!
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

	this.type = merge_types(this.type, pass.type);
	console.assert(this.type !== null, "we checked that merge was valid");

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
					throw "ERROR: Gauge header's value ('" + value + "') should be a number greater than zero.";
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

		//TODO: revisit this, allow any carriers header?
		//This code requires Carriers to be 1 .. 10 in order:
		if (headers.Carriers.join(' ') !== '1 2 3 4 5 6') {
			throw "ERROR: 'Carriers:' header must be '1 2 3 4 5 6'.";
		}

		//Set default 'Width' if not specified + report current value:
		if (!('Width' in headers)) {
			headers.Width = 252;
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
	let racking = 0.0; //racking starts centered
	let stitch = 5; //machine-specific stitch number
	let xferStitch = 0; //machine-specific stitch number for transfers; 0 => default
	let speed = 0; //machine-specific speed number
	let pausePending = false; //optional stop before next instruction, please

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
						type:TYPE_SOFT_MISS,
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
						type:TYPE_SOFT_MISS,
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
						type:TYPE_SOFT_MISS,
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

	//if carriers in 'cs' are marked to in, and add proper gripper ops to info and unmark them:
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
			} else {
				console.assert(false, "inInfo.op must be 'in'");
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

		//Handle operations:
		if (op === 'inhook') {
			throw "ERROR: cannot 'inhook' on this machine.";
		} else if (op === 'in') {
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
				carriers[c] = carrier;
			});
		} else if (op === 'releasehook') {
			throw "ERROR: cannot 'releasehook' on this machine.";
		} else if (op === 'outhook') {
			throw "ERROR: cannot 'outhook' on this machine.";
		} else if (op === 'out') {
			let cs = args;
			
			cs.forEach(function(c){
				if (!(c in carriers)) throw "ERROR: Can't bring out carrier '" + c + "' -- it isn't yet active.";
				if (!carriers[c].last) throw "ERROR: Can't bring out carrier '" + c + "' -- it hasn't yet stitched.";
			});

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
				type:TYPE_SOFT_MISS,
				slots:{},
				racking:racking,
				stitch:stitch,
				speed:speed,
				carriers:cs,
				direction:DIRECTION_LEFT,
				gripper:GRIPPER_OUT,
			};
			info.slots[slotString(n)] = OP_SOFT_MISS;
			//TODO: probably need to figure out some special logic for bringing a carrier out

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
			console.warn("WARNING: x-presser-mode not supported on this machine.");
		} else if (op === 'x-speed-number') {
			console.warn("WARNING: x-speed-number not supported on this machine (though, perhaps, it should be)");
		} else if (op === 'x-stitch-number') {
			console.warn("WARNING: x-stitch-number not supported on this machine (though, perhaps, it should be)");
		} else if (op === 'miss' || op === 'tuck' || op === 'knit') {
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
			if      (op === 'knit') type = (n.isFront() ? TYPE_KNIT_x : TYPE_x_KNIT);
			else if (op === 'tuck') type = (n.isFront() ? TYPE_TUCK_x : TYPE_x_TUCK);
			else if (op === 'miss') type = TYPE_SOFT_MISS; //NOTE: this might not be exactly right

			let info = {
				type:type,
				slots:{},
				racking:racking,
				stitch:stitch,
				speed:speed,
				carriers:cs,
				direction:d,
			};

			if      (op === 'miss') info.slots[slotString(n)] = OP_SOFT_MISS;
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
			if (cs.length !== 0) {
				throw "ERROR: this machine does not support a split (with carriers) instruction.";
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
			} else {
				throw "ERROR: must xfer/split front <-> back.";
			}

			//make sure that this is a valid operation, and fill in proper OP:
			const type = TYPE_XFER;
			const op = (n.isFront() ? OP_XFER_TO_BACK : OP_XFER_TO_FRONT);
			d = ""; //xfer is directionless

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
		} else if (op === 'pause') {
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
			throw "ERROR: All carriers need to be taken out, out missing on carriers: " + Object.keys(carriers) + ".";
		}
	}

	//parse knitout to operations
	//for each operation, translate to color index
	//call pass.add(...), if fails, make a new pass and call pass.add(...)
})();


(function passesToKCode() {

	//compute minimum and maximum slots both for each pass and for the program as a whole:
	let minSlot = Infinity;
	let maxSlot =-Infinity;
	passes.forEach(function(pass){
		pass.minSlot = Infinity;
		pass.maxSlot =-Infinity;
		for (let s in pass.slots) {
			let si = parseInt(s);
			pass.minSlot = Math.min(pass.minSlot, si);
			pass.maxSlot = Math.max(pass.maxSlot, si);
		}
		minSlot = Math.min(minSlot, pass.minSlot);
		maxSlot = Math.max(maxSlot, pass.maxSlot);
	});
	//console.log(minSlot, maxSlot); //DEBUG

	//For now, assume centered pattern when converting needles to slots / slots to needles:
	//gives the offset from slot i to needle n on the front bed:
	const slotToNeedle = (function(){
		if (headers.Position === 'Center') return Math.floor(0.5 * 252 - 0.5 * (maxSlot + minSlot));
		else if (headers.Position === 'Keep') return -1; //assume 1-based needle indexing for keep
		else if (headers.Position === 'Left') return -minSlot;
		else if (headers.Position === 'Right') return 251 - maxSlot;
		else throw "ERROR: unrecognized position header";
	})();
	function frontNeedleToSlot(n) { return n - slotToNeedle; }
	function backNeedleToSlot(n, racking) { return n + Math.floor(racking) - slotToNeedle; }


	//Now convert passes to 'kcode passes' by splitting xfer passes and adding any needed carriage moves:
	let kcodePasses = [];
	//each 'kcode pass' looks like:
	// {
	//    FRNT:'...---_---_- ... ----_---...',
	//    STIF:'555555555555 ... 55555555555',
	//    REAR:'...---_---_- ... ----_---...',
	//    STIR:'555555555555 ... 55555555555',
	//    RACK:1.0,
	//    carrier:5, //carrier index 1-6
	//    carrierLeft:12.5, carrierRight:27.5, //where carrier starts and ends (fractional front-bed needle position)
	//    //carriage info:
	//    carriageLeft:-5.5, carriageRight:-7.5, //where carriage starts and ends (fractional front-bed needle position)
	//    direction:DIRECTION_RIGHT,
	//    type:'Kn-Kn',
	//    speed:100, //carriage speed amount
	//    roller:0, //roller advance amount
	// }

	//yarn carrier state:
	//TODO: verify these starting positions (maybe they don't matter?)
	let carrierAt = {
		'1':-11.5,
		'2':-9.5,
		'3':-9.5,
		'4':-7.5,
		'5':-7.5,
		'6':-7.5,
	};

	//stopping distances past last-used needle location:
	const CARRIER_STOP = 4.5;
	const CARRIAGE_STOP = 4.5;

	//yarn carriage state:
	let nextDirection = DIRECTION_RIGHT;
	let leftStop =    0 - 11.5;
	let rightStop = 251 + 11.5;
	let rack = 0.0;

	//helper function to move carriage to other side of bed:
	function carriageMove(carriageTo) {
		//build a blank pass:
		let bed = '';
		let stitch = '';
		for (let i = 0; i < 15; ++i) {
			bed += '.';
			stitch += '0';
		}
		for (let i = 0; i < 252; ++i) {
			bed += '_';
			stitch += '0';
		}
		for (let i = 0; i < 15; ++i) {
			bed += '.';
			stitch += '0';
		}
		let pass = {
			FRNT:bed, STIF:stitch, REAR:bed, STIR:stitch,
			RACK:rack,
			direction:nextDirection,
			carriageLeft:leftStop,
			carriageRight:rightStop,
			type:'Kn-Kn',
			speed:100, //TODO: might make this faster since no knitting is happening
			roller:0,
			comment:"automatically inserted carriage move"
		};
		kcodePasses.push(pass);

		//update carriage info:
		nextDirection = (nextDirection === DIRECTION_RIGHT ? DIRECTION_LEFT : DIRECTION_RIGHT);
	}

	passes.forEach(function(pass){
		//soft miss will decay to an empty knit/tuck pass:
		if (pass.type === TYPE_SOFT_MISS) {
			console.log("Decaying a SOFT_MISS to a tuck/tuck pass.");
			pass.type = TYPE_TUCK_TUCK;
			pass.comment = "(decayed from a SOFT_MISS)";
		}

		if (pass.type === TYPE_XFER) {
			//this code is going to split the transfers into several passes, using this handy helper:
			function makeXferPass(direction, fromBed, toBed, checkNeedleFn, comment) {
				let xpass = {
					RACK:pass.racking,
					type:'Tr-Rr',
					speed:202,
					roller:0,
					direction:direction,
					carriageLeft:Infinity, //will get updated
					carriageRight:-Infinity, //will get updated
				};
				if (pass.comment) xpass.comment = pass.comment;
				if (typeof(comment) !== 'undefined') {
					if ('comment' in xpass) xpass.comment += ' ' + comment;
					else xpass.comment = comment;
				}

				if (fromBed === 'f' && toBed === 'b' && direction === DIRECTION_RIGHT) {
					xpass.type = 'Tr-Rr';
				} else if (fromBed === 'f' && toBed === 'b' && direction === DIRECTION_LEFT) {
					xpass.type = 'Tr-Rl';
				} else if (fromBed === 'b' && toBed === 'f' && direction === DIRECTION_RIGHT) {
					xpass.type = 'Rr-Tr';
				} else if (fromBed === 'b' && toBed === 'f' && direction === DIRECTION_LEFT) {
					xpass.type = 'Rl-Tr';
				} else {
					throw new Error(`Invalid from/to/direction ${fromBed}/${toBed}/${direction} encountered.`);
				}

				xpass.FRNT = '';
				xpass.STIF = '';
				xpass.REAR = '';
				xpass.STIR = '';

				for (let i = 0; i < 15; ++i) {
					xpass.FRNT += '.';
					xpass.REAR += '.';
					xpass.STIF += '4'; //TODO
					xpass.STIR += '4'; //TODO
				}
				for (let n = 0; n <= 252; ++n) {
					xpass.FRNT += '_';
					xpass.REAR += '_';
					xpass.STIF += '4'; //TODO
					xpass.STIR += '4'; //TODO
				}
				for (let i = 0; i < 15; ++i) {
					xpass.FRNT += '.';
					xpass.REAR += '.';
					xpass.STIF += '4'; //TODO
					xpass.STIR += '4'; //TODO
				}

				function set(str, n) {
					console.assert(str[n] === '_', "Setting unset needle");
					return str.substr(0,n) + '-' + str.substr(n+1);
				}

				for (let n = 0; n <= 252; ++n) {
					if (checkNeedleFn(n)) {
						if (fromBed === 'f') {
							xpass.FRNT = set(xpass.FRNT, 15 + n);
							xpass.REAR = set(xpass.REAR, 15 + n - pass.racking);
							xpass.carriageLeft = Math.min(xpass.carriageLeft, n - CARRIAGE_STOP);
							xpass.carriageRight = Math.max(xpass.carriageRight, n + CARRIAGE_STOP);
						} else { console.assert(fromBed === 'b', "only two options for fromBed");
							xpass.FRNT = set(xpass.FRNT, 15 + n + pass.racking);
							xpass.REAR = set(xpass.REAR, 15 + n);
							xpass.carriageLeft = Math.min(xpass.carriageLeft, n - CARRIAGE_STOP);
							xpass.carriageRight = Math.max(xpass.carriageRight, n + CARRIAGE_STOP);
						}
					}
				}

				//don't add pass if it's empty:
				if (xpass.carriageLeft > xpass.carriageRight) return;

				if (xpass.direction !== nextDirection) {
					console.log("NOTE: 'wasting' a carriage move on an xfer pass.");
					carriageMove();
					console.assert(nextDirection === xpass.direction);
				}

				//shift previous pass's stopping point if needed:
				let prev = (kcodePasses.length > 0 ? kcodePasses[kcodePasses.length-1] : null);

				//update carriage starting/stopping points for this pass:
				if (xpass.direction === DIRECTION_LEFT) {
					//starting point:
					rightStop = xpass.carriageRight = Math.max(rightStop, xpass.carriageRight);
					//shift previous pass's stop as well:
					if (prev) prev.carriageRight = rightStop;
					//stopping point:
					leftStop = xpass.carriageLeft;
				} else {console.assert(xpass.direction === DIRECTION_RIGHT);
					//starting point:
					leftStop = xpass.carriageLeft = Math.min(leftStop, xpass.carriageLeft);
					//shift previous pass's stop as well:
					if (prev) prev.carriageLeft = leftStop;
					//stopping point:
					rightStop = xpass.carriageRight;
				}

				kcodePasses.push(xpass);
				nextDirection = (nextDirection === DIRECTION_RIGHT ? DIRECTION_LEFT : DIRECTION_RIGHT);
			}

			if (false) {
				//lazy all needles xfers:
				makeXferPass(nextDirection, 'f', 'b', (n) => {
					const f = frontNeedleToSlot(n);
					return (f in pass.slots && pass.slots[f].isFront);
				}, '[front-to-back]');

				makeXferPass(nextDirection, 'b', 'f', (n) => {
					const b = backNeedleToSlot(n, pass.racking);
					return (b in pass.slots && pass.slots[b].isBack);
				}, '[back-to-front]');
			} else {
				//fancy alternating needle xfers:
				let isEven = true;
				makeXferPass(nextDirection, 'f', 'b', (n) => {
					const f = frontNeedleToSlot(n);
					isEven = !isEven;
					return (f in pass.slots && pass.slots[f].isFront && !isEven);
				}, '[front-to-back, even]');
				isEven = true;
				makeXferPass(nextDirection, 'f', 'b', (n) => {
					const f = frontNeedleToSlot(n);
					isEven = !isEven;
					return (f in pass.slots && pass.slots[f].isFront && isEven);
				}, '[front-to-back, odd]');

				isEven = true;
				makeXferPass(nextDirection, 'b', 'f', (n) => {
					const b = backNeedleToSlot(n, pass.racking);
					isEven = !isEven;
					return (b in pass.slots && pass.slots[b].isBack && !isEven);
				}, '[back-to-front, even]');
				isEven = true;
				makeXferPass(nextDirection, 'b', 'f', (n) => {
					const b = backNeedleToSlot(n, pass.racking);
					isEven = !isEven;
					return (b in pass.slots && pass.slots[b].isBack && isEven);
				}, '[back-to-front, odd]');
			}

		} else {
			//some sort of knit/tuck pass:
			rack = pass.racking;
			let kpass = {
				RACK:rack,
				type:pass.type.kcode,
				speed:100,
				roller:100,
			};
			if (pass.comment) kpass.comment = pass.comment;

			//set pass direction and carrier info:
			if (pass.carriers.length === 0) {
				//really a drop/amiss pass...
				console.assert(pass.direction === DIRECTION_NONE);
				kpass.direction = nextDirection;
			} else {
				console.assert(pass.carriers.length === 1, "expecting zero or one carriers per pass");
				kpass.direction = pass.direction;

				kpass.carrier = pass.carriers[0];
				console.assert(kpass.carrier in carrierAt, "carrier '" + kpass.carrier + "' should be in carrierAt list.");
				//set carrier stopping points:
				if (kpass.direction === DIRECTION_LEFT) {
					kpass.carrierRight = carrierAt[kpass.carrier];
					kpass.carrierLeft = pass.minSlot + slotToNeedle - CARRIER_STOP;
					carrierAt[kpass.carrier] = kpass.carrierLeft;
				} else { console.assert(kpass.direction === DIRECTION_RIGHT);
					kpass.carrierLeft = carrierAt[kpass.carrier];
					kpass.carrierRight = pass.maxSlot + slotToNeedle + CARRIER_STOP;
					carrierAt[kpass.carrier] = kpass.carrierRight;
				}
			}

			//insert a carriage move pass if needed:
			if (kpass.direction !== nextDirection) {
				//update carriage stopping point for carriage move:
				if (kpass.direction === DIRECTION_LEFT) {
					rightStop = pass.maxSlot + slotToNeedle + CARRIAGE_STOP;
				} else {console.assert(kpass.direction === DIRECTION_RIGHT);
					leftStop = pass.minSlot + slotToNeedle - CARRIAGE_STOP;
				}
				//perform carriage move:
				carriageMove();
				console.assert(nextDirection === kpass.direction);
			}

			//shift previous pass's stopping point if needed:
			let kprev = (kcodePasses.length > 0 ? kcodePasses[kcodePasses.length-1] : null);
			//update carriage starting/stopping points for this pass:
			if (kpass.direction === DIRECTION_LEFT) {
				//starting point:
				rightStop = Math.max(rightStop, pass.maxSlot + slotToNeedle + CARRIAGE_STOP);
				//shift previous pass's stop as well:
				if (kprev) kprev.carriageRight = rightStop;
				//stopping point:
				leftStop = pass.minSlot + slotToNeedle - CARRIAGE_STOP;
			} else {console.assert(kpass.direction === DIRECTION_RIGHT);
				//starting point:
				leftStop = Math.min(leftStop, pass.minSlot + slotToNeedle - CARRIAGE_STOP);
				//shift previous pass's stop as well:
				if (kprev) kprev.carriageLeft = leftStop;
				//stopping point:
				rightStop = pass.maxSlot + slotToNeedle + CARRIAGE_STOP;
			}
			kpass.carriageLeft = leftStop;
			kpass.carriageRight = rightStop;

			//build needle selections:
			kpass.FRNT = '';
			kpass.STIF = '';
			kpass.REAR = '';
			kpass.STIR = '';

			for (let i = 0; i < 15; ++i) {
				kpass.FRNT += '.';
				kpass.REAR += '.';
				kpass.STIF += '5'; //TODO
				kpass.STIR += '5'; //TODO
			}
			for (let n = 0; n <= 252; ++n) {
				const f = frontNeedleToSlot(n);
				if (f in pass.slots && pass.slots[f].isFront) {
					kpass.FRNT += '-';
				} else {
					kpass.FRNT += '_';
				}
				const b = backNeedleToSlot(n, pass.racking);
				if (b in pass.slots && pass.slots[b].isBack) {
					kpass.REAR += '-';
				} else {
					kpass.REAR += '_';
				}
				kpass.STIF += '5'; //TODO
				kpass.STIR += '5'; //TODO
			}
			for (let i = 0; i < 15; ++i) {
				kpass.FRNT += '.';
				kpass.REAR += '.';
				kpass.STIF += '5'; //TODO
				kpass.STIR += '5'; //TODO
			}
			kcodePasses.push(kpass);
			nextDirection = (nextDirection === DIRECTION_RIGHT ? DIRECTION_LEFT : DIRECTION_RIGHT);
		}
	});


	//Finally, write 'kcode passes', using some look-ahead / look-behind to figure out carriage turn-around points:
	let kcode = [];

	function out(x) {
		kcode.push(x);
		//console.log(x);
	}

	out("HOME");
	out("RACK:0");

	let lastRACK = 0.0;
	kcodePasses.forEach(function(kpass){
		//console.log("Doing:", kpass); //DEBUG
		out("//"); out("//"); out("//"); out("//"); //why do they do this?
		if ('comment' in kpass) {
			out("// " + kpass.comment);
		}
		if (kpass.RACK != lastRACK) {
			out("RACK:" + kpass.RACK);
			lastRACK = kpass.RACK;
		}
		let FRNT = kpass.FRNT;
		let REAR = kpass.REAR;
		let op = (kpass.direction === DIRECTION_RIGHT ? ">>" : "<<");
		op += " " + kpass.type;
		//insert carrier / carriage stopping points:
		console.assert(kpass.carriageLeft < kpass.carriageRight, "properly ordered carriage stops");
		console.assert(kpass.carriageLeft - Math.floor(kpass.carriageLeft) === 0.5, "carriage stop is properly fractional");
		console.assert(kpass.carriageRight - Math.floor(kpass.carriageRight) === 0.5, "carriage stop is properly fractional");
		//make into an index into the needle selection string:
		const carriageLeft = kpass.carriageLeft + 15.5;
		const carriageRight = kpass.carriageRight + 15.5;
		if ('carrier' in kpass) {
			op += " " + kpass.carrier;
			console.assert(kpass.carrierLeft < kpass.carrierRight, "properly ordered carrier stops");
			console.assert(kpass.carrierLeft - Math.floor(kpass.carrierLeft) === 0.5, "carrier stop is properly fractional");
			console.assert(kpass.carrierRight - Math.floor(kpass.carrierRight) === 0.5, "carrier stop is properly fractional");
			console.assert(kpass.carriageLeft <= kpass.carrierLeft, "carriage comes before carrier on the left");
			console.assert(kpass.carrierRight <= kpass.carriageRight, "carrier comes before carriage on the right");
			//make into an index into the needle selection string:
			const carrierLeft = kpass.carrierLeft + 15.5;
			const carrierRight = kpass.carrierRight + 15.5;
			//insert punctuation:
			FRNT = FRNT.substr(0,carriageRight) + '\\' + FRNT.substr(carriageRight);
			FRNT = FRNT.substr(0,carrierRight) + kpass.carrier + FRNT.substr(carrierRight);
			FRNT = FRNT.substr(0,carrierLeft) + kpass.carrier + FRNT.substr(carrierLeft);
			FRNT = FRNT.substr(0,carriageLeft) + '/' + FRNT.substr(carriageLeft);
			REAR = REAR.substr(0,carriageRight) + '\\' + REAR.substr(carriageRight);
			REAR = REAR.substr(0,carrierRight) + kpass.carrier + REAR.substr(carrierRight);
			REAR = REAR.substr(0,carrierLeft) + kpass.carrier + REAR.substr(carrierLeft);
			REAR = REAR.substr(0,carriageLeft) + '/' + REAR.substr(carriageLeft);
		} else {
			op += " " + "0";
			FRNT = FRNT.substr(0,carriageRight) + '\\' + FRNT.substr(carriageRight);
			FRNT = FRNT.substr(0,carriageLeft) + '/' + FRNT.substr(carriageLeft);
			REAR = REAR.substr(0,carriageRight) + '\\' + REAR.substr(carriageRight);
			REAR = REAR.substr(0,carriageLeft) + '/' + REAR.substr(carriageLeft);
		}
		op += " " + kpass.speed;
		op += " " + kpass.roller;

		out("FRNT:" + FRNT);
		out("STIF:" + kpass.STIF);
		out("REAR:" + REAR);
		out("STIR:" + kpass.STIR);
		out(op);
	});

	fs.writeFileSync(kcFile, kcode.join("\n") + "\n");

})();

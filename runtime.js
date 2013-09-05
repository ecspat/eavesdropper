/*******************************************************************************
 * Copyright (c) 2013 Max Schaefer.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *     Max Schaefer - initial API and implementation
 *******************************************************************************/

/*global require module */

var TaggedValue = require('./TaggedValue'),
    util = require('./util');

function Runtime(observer) {
	this.observer = observer;
}

var isWrapped = Runtime.prototype.isWrapped = function(val) {
	return val instanceof TaggedValue;
};

var unwrap = Runtime.prototype.unwrap = function(val) {
	return isWrapped(val) ? val.getValue() : val;
};

var wrapGlobal = Runtime.prototype.wrapGlobal = function(pos, global) {
	var tag = this.observer.tagGlobal(global);
	util.setHiddenProp(global, "__properties", {});
	var tagged_global = new TaggedValue(global, tag);
	this.observer.setGlobal(tagged_global);
	return tagged_global;
};

Runtime.prototype.wrapLiteral = function(pos, lit, getter_pos, setter_pos) {
	var res = new TaggedValue(lit, this.observer.tagLiteral(pos, lit));
	
	// it can happen that we are asked to wrap a literal that has already been wrapped before, in which case we don't need to do re-wrap
	if(Object(lit) === lit && !util.hasOwnProperty(lit, '__properties')) {
		util.setHiddenProp(lit, "__properties", {});
		
		for(var p in lit) {
			var desc = util.getOwnPropertyDescriptor(lit, p);
			if(desc) {
				if(desc.get || desc.set) {
					this.defineAccessors(pos, res, p, false, desc.get, getter_pos[p], desc.set, setter_pos[p]);
				} else {
					this.propwrite(pos, res, new TaggedValue(p, this.observer.tagLiteral(null, p)), false, desc.value);
				}
			}
		}
		
		if(typeof lit === 'function') {
			util.setHiddenProp(lit, "__instrumented", true);
			this.propwrite(pos, res, new TaggedValue('prototype', this.observer.tagLiteral(null, 'prototype')), false, new TaggedValue(lit.prototype, this.observer.tagDefaultPrototype(res, lit.prototype)));
			// also tag name, arguments, length, caller? what about prototype.constructor?
		}
	}
	return res;
};

var wrapForInVar = Runtime.prototype.wrapForInVar = function(pos, prop) {
	return new TaggedValue(prop, this.observer.tagForInVar(prop));
};

var wrapNativeException = Runtime.prototype.wrapNativeException = function(pos, exn) {
	if(exn instanceof TaggedValue) {
		return exn;
	} else {
		return new TaggedValue(exn, this.observer.tagNativeException(exn));
	}
};

var wrapNativeArgument = Runtime.prototype.wrapNativeArgument = function(callee, arg, idx) {
	return new TaggedValue(arg, this.observer.tagNativeArgument(callee, arg, idx+1));
};

var wrapNativeReceiver = Runtime.prototype.wrapNativeReceiver = function(callee, recv) {
	return new TaggedValue(recv, this.observer.tagNativeArgument(callee, recv, 0));
};

var enterScript = Runtime.prototype.enterScript = function() {};
var leaveScript = Runtime.prototype.leaveScript = function() {};

var enterFunction = Runtime.prototype.enterFunction = function(pos, callee) {
	this.observer.enterFunction(pos, new TaggedValue(callee, this.observer.tagCallee(callee)));
};

var returnFromFunction = Runtime.prototype.returnFromFunction = function(retval) {
	this.observer.returnFromFunction(retval);
};

var leaveFunction = Runtime.prototype.leaveFunction = function() {
	this.observer.leaveFunction();
};

var callWrapped = Runtime.prototype.callWrapped = function(recv, args) {
	try {
		var wrapped_recv = this.wrapNativeReceiver(args.callee, recv),
		    wrapped_args = [];
		for(var i=0,n=args.length;i<n;++i) {
			wrapped_args[i] = this.wrapNativeArgument(args.callee, args[i], i);
		}
		var wrapped_res = util.apply(args.callee, wrapped_recv, wrapped_args);
		return wrapped_res.getValue();
	} catch(e) {
		throw unwrap(e);
	}
};

var methodcall = Runtime.prototype.methodcall = function(pos, recv, msg, args) {
	return this.funcall(pos, this.propread(null, recv, msg), recv, args, 'method');
};

var funcall = Runtime.prototype.funcall = function(pos, callee, recv, args, kind) {
	var unwrapped_callee = callee.getValue(), i, n;
	switch(unwrapped_callee) {
	case Function.prototype.call:
		return this.funcall(pos, recv, args[0], util.slice(args, 1), 'method');
	case Function.prototype.apply:
		var real_args = [];
		if(args[1]) {
			for(i=0,n=args[1].value.length;i<n;++i) {
				var val = args[1].value[i];
				real_args[i] = new TaggedValue(val, getPropertyTag(args[1].value, i) || this.observer.tagNativeProperty(args[1].value, i, val));
			}
		}
		return this.funcall(pos, recv, args[0], real_args, 'method');
	}
	
	if(kind !== 'new')
		this.observer.funcall(pos, callee, recv, args, kind);
	if(unwrapped_callee.__instrumented) {
		return util.apply(unwrapped_callee, recv, args);
	} else {
		var unwrapped_args = [];
		for(i=0,n=args.length;i<n;++i) {
			unwrapped_args[i] = args[i].getValue();
		}
		var res = util.apply(unwrapped_callee, recv.getValue(), unwrapped_args);
		if(!isWrapped(res))
			res = new TaggedValue(res, this.observer.tagNativeResult(res, callee, recv, args));
		return res;
	}
};

var newexpr = Runtime.prototype.newexpr = function(pos, callee, args) {
	this.observer.newexpr(pos, callee, args);
	var unwrapped_callee = callee.getValue(), res;
	if(unwrapped_callee.__instrumented) {
		var new_instance = util.Object_create(unwrapped_callee.prototype);
		var recv = new TaggedValue(new_instance, this.observer.tagNewInstance(new_instance, callee, args));
		res = this.funcall(pos, callee, recv, args, 'new');
		return Object(res.getValue()) === res.getValue() ? res : recv;
	} else {
		var a = [];
		for(var i=0,n=args.length;i<n;++i)
			a[i] = 'args[' + i + '].getValue()';
		res = eval('new unwrapped_callee(' + a.join() + ')');
		if(!isWrapped(res))
			res = new TaggedValue(res, this.observer.tagNewNativeInstance(res, callee, args));
		return res;
	}
};

var prepareArguments = Runtime.prototype.prepareArguments = function(args) {
	var args_copy = args,
		new_args = new TaggedValue(arguments, this.observer.tagLiteral(null, args));
	
	util.setHiddenProp(arguments, "__properties", {});
	
	// separate tags and values of actual arguments
	for(var i=0,n=args_copy.length;i<n;++i) {
		arguments[i] = args_copy[i].getValue();
		setPropertyTag(arguments, i, args_copy[i].getTag());
	}
	
	// finally, delete any additional elements of our local arguments array
	for(i=args_copy.length,n=arguments.length;i<n;++i) {
		delete arguments[i];
	}
	
	// set up non-numeric properties of arguments array
	arguments.__proto__ = args_copy.__proto__;
	arguments.length = args_copy.length;
	arguments.callee = args_copy.callee;
	setPropertyTag(arguments, '__proto__', this.observer.tagLiteral(null, arguments.__proto__));
	setPropertyTag(arguments, 'length', this.observer.tagLiteral(null, arguments.length));
	setPropertyTag(arguments, 'callee', arguments.callee.hasOwnProperty('__tag') && arguments.callee.__tag || this.observer.tagLiteral(null, arguments.callee));
	
	return new_args;
};

var binop = Runtime.prototype.binop = function(pos, left, op, right) {
	var res = eval("left.getValue()" + op + " right.getValue()");
	return new TaggedValue(res, this.observer.tagBinOpResult(res, left, op, right));
};

var unop = Runtime.prototype.unop = function(pos, op, arg) {
	var res = eval(op + " arg.getValue()");
	return new TaggedValue(res, this.observer.tagUnOpResult(res, op, arg));
};

function getPropertyTag(obj, prop) {
	return util.hasOwnProperty(obj, '__properties') && obj.__properties['$' + prop];
}

function setPropertyTag(obj, prop, tag) {
	if(util.hasOwnProperty(obj, '__properties')) {
		obj.__properties['$' + prop] = tag;
	}
}

function deletePropertyTag(obj, prop) {
	if(util.hasOwnProperty(obj, '__properties'))
		delete obj.__properties['$' + prop];
}

function getDescriptor(obj, prop) {
	if(!obj)
		return;
	return util.getOwnPropertyDescriptor(obj, prop) ||
		   getDescriptor(util.getPrototypeOf(obj), prop);
}

var propread = Runtime.prototype.propread = function(pos, obj, prop, isDynamic) {
	var unwrapped_obj = Object(obj.getValue()), unwrapped_prop = prop.getValue();
	var desc = getDescriptor(unwrapped_obj, unwrapped_prop);
	var res, stored_tag;
	if(desc && desc.get) {
		var getter_tag = util.hasOwnProperty(unwrapped_obj, '__properties') && unwrapped_obj.__properties['get ' + unwrapped_prop];
		return this.funcall(pos, new TaggedValue(desc.get, getter_tag), obj, [], 'method');
	} else {
		res = unwrapped_obj[unwrapped_prop];
		stored_tag = getPropertyTag(unwrapped_obj, unwrapped_prop) || this.observer.tagNativeProperty(unwrapped_obj, unwrapped_prop, res);
		return new TaggedValue(res, this.observer.tagPropRead(res, obj, prop, stored_tag));
	}
};

var propwrite = Runtime.prototype.propwrite = function(pos, obj, prop, isDynamic, val) {
	var unwrapped_obj = Object(obj.getValue()), unwrapped_prop = prop.getValue(), unwrapped_val = val.getValue();
	var desc = getDescriptor(unwrapped_obj, unwrapped_prop);
	var res;
	if(desc && desc.set) {
		var setter_tag = util.hasOwnProperty(unwrapped_obj, '__properties') && unwrapped_obj.__properties['set ' + unwrapped_prop];
		this.funcall(pos, new TaggedValue(desc.set, setter_tag), obj, [val], 'method');
	} else {
		unwrapped_obj[unwrapped_prop] = unwrapped_val;
		setPropertyTag(unwrapped_obj, unwrapped_prop, this.observer.tagPropWrite(obj, prop, val));
	}
	return val;
};

Runtime.prototype.defineAccessors = function(pos, obj, prop, isDynamic, getter, getter_pos, setter, setter_pos) {
	var unwrapped_obj = obj.getValue();
	util.defineProperty(unwrapped_obj, prop, { get: getter, set: setter, enumerable: true });
	if(unwrapped_obj.hasOwnProperty('__properties')) {
		if(getter) {
			var getter_tag = this.observer.tagGetter(pos, getter, getter_pos);
			this.observer.defineGetter(obj.getTag(), prop, getter_tag);
			unwrapped_obj.__properties['get ' + prop] = getter_tag;
		}
		if(setter) {
			var setter_tag = this.observer.tagSetter(pos, setter, setter_pos);
			this.observer.defineSetter(obj.getTag(), prop, setter_tag);
			unwrapped_obj.__properties['set ' + prop] = setter_tag;
		}
	}
};

var propdel = Runtime.prototype.propdel = function(pos, obj, prop, isDynamic) {
	var unwrapped_obj = obj.getValue(), unwrapped_prop = prop.getValue();
	var res = delete unwrapped_obj[unwrapped_prop];
	deletePropertyTag(unwrapped_obj, unwrapped_prop);
	return res;
};

module.exports = Runtime;
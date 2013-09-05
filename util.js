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
 
/*global exports*/
 
var Object_create = Object.create,
	Object_defineProperty = Object.defineProperty,
	Object_getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor,
    Object_getPrototypeOf = Object.getPrototypeOf,
    Object_prototype_hasOwnProperty = Object.prototype.hasOwnProperty,
    Function_prototype_apply = Function.prototype.apply,
    Array_prototype_slice = Array.prototype.slice;

var setHiddenProp = exports.setHiddenProp = function(obj, prop, val) {
	Object_defineProperty(obj, prop, { enumerable: false, writable: false, configurable: true, value: val });
	return val;
};

// substitute for Function.prototype.apply in case it gets monkey patched
var apply = exports.apply = function(fn, recv, args) {
	if(!fn) {
		// provoke exception
		fn();
	} else if(fn.apply === Function_prototype_apply) {
		return fn.apply(recv, args);
	} else {
		var app = "__apply__", i = 0;
		while(app in fn) {
			app = "__apply__" + (i++);
		}
		setHiddenProp(fn, app, Function_prototype_apply);
		try {
			return fn[app](recv, args);
		} finally {
			delete fn[app];
		}
	}
};

exports.hasOwnProperty = function(obj, prop) {
	return apply(Object_prototype_hasOwnProperty, obj, [prop]);
};

exports.slice = function(ary, idx) {
	return apply(Array_prototype_slice, ary, [idx]);
};

exports.defineProperty = Object_defineProperty;
exports.getPrototypeOf = Object_getPrototypeOf;
exports.Object_create = Object_create;
exports.getOwnPropertyDescriptor = Object_getOwnPropertyDescriptor;
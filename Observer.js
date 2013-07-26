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

/*global module */

function Observer() {
}

Observer.prototype.tagGlobal =
Observer.prototype.setGlobal =
Observer.prototype.tagLiteral =
Observer.prototype.tagDefaultPrototype =
Observer.prototype.tagForInVar =
Observer.prototype.tagNativeException =
Observer.prototype.tagNativeArgument =
Observer.prototype.tagNativeResult =
Observer.prototype.tagNativeProperty =
Observer.prototype.tagCallee =
Observer.prototype.tagNewInstance =
Observer.prototype.tagNewNativeInstance =
Observer.prototype.tagUnOpResult =
Observer.prototype.tagBinOpResult =
Observer.prototype.enterFunction =
Observer.prototype.returnFromFunction =
Observer.prototype.leaveFunction =
Observer.prototype.funcall =
Observer.prototype.newexpr =
function() {
	return null;
};

Observer.prototype.tagPropRead = function(val, obj, prop, stored_tag) {
	return stored_tag;
};

Observer.prototype.tagPropWrite = function(obj, prop, val, stored_tag) {
	return val.getTag();
};

module.exports = Observer;
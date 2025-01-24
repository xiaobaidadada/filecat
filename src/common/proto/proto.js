/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars*/
"use strict";

var $protobuf = require("protobufjs/minimal");

// Common aliases
var $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;

// Exported root namespace
var $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});

$root.WsMessage = (function() {

    /**
     * Properties of a WsMessage.
     * @exports IWsMessage
     * @interface IWsMessage
     * @property {number|null} [cmdType] WsMessage cmdType
     * @property {string|null} [context] WsMessage context
     * @property {Uint8Array|null} [binContext] WsMessage binContext
     * @property {string|null} [message] WsMessage message
     * @property {number|null} [code] WsMessage code
     */

    /**
     * Constructs a new WsMessage.
     * @exports WsMessage
     * @classdesc Represents a WsMessage.
     * @implements IWsMessage
     * @constructor
     * @param {IWsMessage=} [properties] Properties to set
     */
    function WsMessage(properties) {
        if (properties)
            for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                if (properties[keys[i]] != null)
                    this[keys[i]] = properties[keys[i]];
    }

    /**
     * WsMessage cmdType.
     * @member {number} cmdType
     * @memberof WsMessage
     * @instance
     */
    WsMessage.prototype.cmdType = 0;

    /**
     * WsMessage context.
     * @member {string} context
     * @memberof WsMessage
     * @instance
     */
    WsMessage.prototype.context = "";

    /**
     * WsMessage binContext.
     * @member {Uint8Array} binContext
     * @memberof WsMessage
     * @instance
     */
    WsMessage.prototype.binContext = $util.newBuffer([]);

    /**
     * WsMessage message.
     * @member {string} message
     * @memberof WsMessage
     * @instance
     */
    WsMessage.prototype.message = "";

    /**
     * WsMessage code.
     * @member {number} code
     * @memberof WsMessage
     * @instance
     */
    WsMessage.prototype.code = 0;

    /**
     * Creates a new WsMessage instance using the specified properties.
     * @function create
     * @memberof WsMessage
     * @static
     * @param {IWsMessage=} [properties] Properties to set
     * @returns {WsMessage} WsMessage instance
     */
    WsMessage.create = function create(properties) {
        return new WsMessage(properties);
    };

    /**
     * Encodes the specified WsMessage message. Does not implicitly {@link WsMessage.verify|verify} messages.
     * @function encode
     * @memberof WsMessage
     * @static
     * @param {IWsMessage} message WsMessage message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    WsMessage.encode = function encode(message, writer) {
        if (!writer)
            writer = $Writer.create();
        if (message.cmdType != null && Object.hasOwnProperty.call(message, "cmdType"))
            writer.uint32(/* id 1, wireType 0 =*/8).int32(message.cmdType);
        if (message.context != null && Object.hasOwnProperty.call(message, "context"))
            writer.uint32(/* id 2, wireType 2 =*/18).string(message.context);
        if (message.binContext != null && Object.hasOwnProperty.call(message, "binContext"))
            writer.uint32(/* id 3, wireType 2 =*/26).bytes(message.binContext);
        if (message.message != null && Object.hasOwnProperty.call(message, "message"))
            writer.uint32(/* id 4, wireType 2 =*/34).string(message.message);
        if (message.code != null && Object.hasOwnProperty.call(message, "code"))
            writer.uint32(/* id 5, wireType 0 =*/40).int32(message.code);
        return writer;
    };

    /**
     * Encodes the specified WsMessage message, length delimited. Does not implicitly {@link WsMessage.verify|verify} messages.
     * @function encodeDelimited
     * @memberof WsMessage
     * @static
     * @param {IWsMessage} message WsMessage message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    WsMessage.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
    };

    /**
     * Decodes a WsMessage message from the specified reader or buffer.
     * @function decode
     * @memberof WsMessage
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @param {number} [length] Message length if known beforehand
     * @returns {WsMessage} WsMessage
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    WsMessage.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
            reader = $Reader.create(reader);
        var end = length === undefined ? reader.len : reader.pos + length, message = new $root.WsMessage();
        while (reader.pos < end) {
            var tag = reader.uint32();
            switch (tag >>> 3) {
            case 1: {
                    message.cmdType = reader.int32();
                    break;
                }
            case 2: {
                    message.context = reader.string();
                    break;
                }
            case 3: {
                    message.binContext = reader.bytes();
                    break;
                }
            case 4: {
                    message.message = reader.string();
                    break;
                }
            case 5: {
                    message.code = reader.int32();
                    break;
                }
            default:
                reader.skipType(tag & 7);
                break;
            }
        }
        return message;
    };

    /**
     * Decodes a WsMessage message from the specified reader or buffer, length delimited.
     * @function decodeDelimited
     * @memberof WsMessage
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @returns {WsMessage} WsMessage
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    WsMessage.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
            reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
    };

    /**
     * Verifies a WsMessage message.
     * @function verify
     * @memberof WsMessage
     * @static
     * @param {Object.<string,*>} message Plain object to verify
     * @returns {string|null} `null` if valid, otherwise the reason why it is not
     */
    WsMessage.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
            return "object expected";
        if (message.cmdType != null && message.hasOwnProperty("cmdType"))
            if (!$util.isInteger(message.cmdType))
                return "cmdType: integer expected";
        if (message.context != null && message.hasOwnProperty("context"))
            if (!$util.isString(message.context))
                return "context: string expected";
        if (message.binContext != null && message.hasOwnProperty("binContext"))
            if (!(message.binContext && typeof message.binContext.length === "number" || $util.isString(message.binContext)))
                return "binContext: buffer expected";
        if (message.message != null && message.hasOwnProperty("message"))
            if (!$util.isString(message.message))
                return "message: string expected";
        if (message.code != null && message.hasOwnProperty("code"))
            if (!$util.isInteger(message.code))
                return "code: integer expected";
        return null;
    };

    /**
     * Creates a WsMessage message from a plain object. Also converts values to their respective internal types.
     * @function fromObject
     * @memberof WsMessage
     * @static
     * @param {Object.<string,*>} object Plain object
     * @returns {WsMessage} WsMessage
     */
    WsMessage.fromObject = function fromObject(object) {
        if (object instanceof $root.WsMessage)
            return object;
        var message = new $root.WsMessage();
        if (object.cmdType != null)
            message.cmdType = object.cmdType | 0;
        if (object.context != null)
            message.context = String(object.context);
        if (object.binContext != null)
            if (typeof object.binContext === "string")
                $util.base64.decode(object.binContext, message.binContext = $util.newBuffer($util.base64.length(object.binContext)), 0);
            else if (object.binContext.length >= 0)
                message.binContext = object.binContext;
        if (object.message != null)
            message.message = String(object.message);
        if (object.code != null)
            message.code = object.code | 0;
        return message;
    };

    /**
     * Creates a plain object from a WsMessage message. Also converts values to other types if specified.
     * @function toObject
     * @memberof WsMessage
     * @static
     * @param {WsMessage} message WsMessage
     * @param {$protobuf.IConversionOptions} [options] Conversion options
     * @returns {Object.<string,*>} Plain object
     */
    WsMessage.toObject = function toObject(message, options) {
        if (!options)
            options = {};
        var object = {};
        if (options.defaults) {
            object.cmdType = 0;
            object.context = "";
            if (options.bytes === String)
                object.binContext = "";
            else {
                object.binContext = [];
                if (options.bytes !== Array)
                    object.binContext = $util.newBuffer(object.binContext);
            }
            object.message = "";
            object.code = 0;
        }
        if (message.cmdType != null && message.hasOwnProperty("cmdType"))
            object.cmdType = message.cmdType;
        if (message.context != null && message.hasOwnProperty("context"))
            object.context = message.context;
        if (message.binContext != null && message.hasOwnProperty("binContext"))
            object.binContext = options.bytes === String ? $util.base64.encode(message.binContext, 0, message.binContext.length) : options.bytes === Array ? Array.prototype.slice.call(message.binContext) : message.binContext;
        if (message.message != null && message.hasOwnProperty("message"))
            object.message = message.message;
        if (message.code != null && message.hasOwnProperty("code"))
            object.code = message.code;
        return object;
    };

    /**
     * Converts this WsMessage to JSON.
     * @function toJSON
     * @memberof WsMessage
     * @instance
     * @returns {Object.<string,*>} JSON object
     */
    WsMessage.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };

    /**
     * Gets the default type url for WsMessage
     * @function getTypeUrl
     * @memberof WsMessage
     * @static
     * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns {string} The default type url
     */
    WsMessage.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
        if (typeUrlPrefix === undefined) {
            typeUrlPrefix = "type.googleapis.com";
        }
        return typeUrlPrefix + "/WsMessage";
    };

    return WsMessage;
})();

module.exports = $root;

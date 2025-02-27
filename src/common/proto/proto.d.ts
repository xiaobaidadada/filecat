import * as $protobuf from "protobufjs";
import Long = require("long");
/** Properties of a WsMessage. */
export interface IWsMessage {

    /** WsMessage cmdType */
    cmdType?: (number|null);

    /** WsMessage context */
    context?: (string|null);

    /** WsMessage binContext */
    binContext?: (Uint8Array|null);

    /** WsMessage message */
    message?: (string|null);

    /** WsMessage code */
    code?: (number|null);

    /** WsMessage randomId */
    randomId?: (string|null);
}

/** Represents a WsMessage. */
export class WsMessage implements IWsMessage {

    /**
     * Constructs a new WsMessage.
     * @param [properties] Properties to set
     */
    constructor(properties?: IWsMessage);

    /** WsMessage cmdType. */
    public cmdType: number;

    /** WsMessage context. */
    public context: string;

    /** WsMessage binContext. */
    public binContext: Uint8Array;

    /** WsMessage message. */
    public message: string;

    /** WsMessage code. */
    public code: number;

    /** WsMessage randomId. */
    public randomId: string;

    /**
     * Creates a new WsMessage instance using the specified properties.
     * @param [properties] Properties to set
     * @returns WsMessage instance
     */
    public static create(properties?: IWsMessage): WsMessage;

    /**
     * Encodes the specified WsMessage message. Does not implicitly {@link WsMessage.verify|verify} messages.
     * @param message WsMessage message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IWsMessage, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified WsMessage message, length delimited. Does not implicitly {@link WsMessage.verify|verify} messages.
     * @param message WsMessage message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IWsMessage, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a WsMessage message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns WsMessage
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): WsMessage;

    /**
     * Decodes a WsMessage message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns WsMessage
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): WsMessage;

    /**
     * Verifies a WsMessage message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a WsMessage message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns WsMessage
     */
    public static fromObject(object: { [k: string]: any }): WsMessage;

    /**
     * Creates a plain object from a WsMessage message. Also converts values to other types if specified.
     * @param message WsMessage
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: WsMessage, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this WsMessage to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };

    /**
     * Gets the default type url for WsMessage
     * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns The default type url
     */
    public static getTypeUrl(typeUrlPrefix?: string): string;
}

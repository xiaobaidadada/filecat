/**
 * Shared credential types and metadata.
 *
 * Lives in src/common because the "credential type -> form fields" metadata exists only once:
 * the frontend settings page renders forms from it, and the backend validates and builds
 * driver config from it. Both sides read the same constant so the shape cannot drift apart.
 */

/** OAuth token payload (currently used by Baidu Netdisk) */
export interface OAuthTokens {
    access_token: string;
    refresh_token: string;
    /** access_token expiry (ms timestamp, already shifted 5 minutes early) */
    expires_at: number;
    /** When the token was obtained (ms timestamp) */
    obtained_at: number;
}

/**
 * A sub-account under a credential.
 *
 * Only "one credential, many accounts" types have these (Baidu Netdisk, TCP-proxy FileCat):
 * the credential itself holds the application config (AppKey/SecretKey), while accounts live
 * independently in the accounts array. When mounting, the user first picks a credential, then
 * picks a specific account for those types (FileMountItem.account_id).
 */
export interface MountAccount {
    /** Unique account id (Baidu uses uk, tcp_proxy uses a generated uuid) */
    id: string;
    /** Account note (user-defined, display only; falls back to the account name when empty) */
    note?: string;
    /** OAuth token (refresh_token rotates, the new one must be persisted) */
    token?: OAuthTokens;
    /** Account name (e.g. Baidu account name, remote FileCat login name) */
    account_name?: string;
    /** Login password (used by tcp_proxy; stored in plain text like other credentials) */
    password?: string;
    /** SSH private key; when present it takes precedence over the password */
    private_key?: string;
    /** S3 Secret Key (access_key is stored in account_name) */
    secret_key?: string;
    /** Local directory source path (absolute); only used by the local driver */
    path?: string;
    /** Display name (e.g. Baidu Netdisk nickname) */
    nickname?: string;
    avatar_url?: string;
    /** Whether enabled; mounts referencing a disabled account are unavailable */
    enabled?: boolean;
}

/**
 * A credential - reusable "account / identity information" shared by multiple mounts.
 *
 * Design intent: separate "how to connect" from "where to mount".
 *  - Credentials are managed in Settings -> Mount (e.g. one WebDAV account, one Baidu app)
 *  - A mount only needs to pick a saved credential instead of re-entering everything
 *  - The same credential can be mounted to multiple local directories
 *  - For multi-account types (Baidu, TCP proxy), accounts live in the accounts array
 */
export interface CredentialItem {
    /** Unique id */
    id: string;
    /** Credential type; matches the driver type */
    type: CredentialType;
    /** Note (user-defined, helps tell credentials apart when mounting) */
    note: string;
    /** Sub-account list; only multi-account types have these (Baidu, TCP proxy) */
    accounts?: MountAccount[];
    /** Whether enabled; mounts referencing a disabled credential are unavailable */
    enabled?: boolean;
    /** Owner user id */
    // user_id?: string;
    created_at?: number;

    // ========== WebDAV ==========
    /** Service URL, e.g. https://example.com/dav */
    webdav_url?: string;

    // ========== SSH / SFTP ==========
    /** Hostname or IP */
    ssh_host?: string;
    /** Port, default 22 */
    ssh_port?: number;
    /** Private key content (PEM), alternative to account password */
    ssh_private_key?: string;

    // ========== SMB / Windows share ==========
    /** Hostname or IP */
    smb_server?: string;

    // ========== S3 compatible object storage ==========
    /** Service URL, e.g. https://s3.amazonaws.com */
    s3_endpoint?: string;
    /** Region, e.g. us-east-1 */
    s3_region?: string;
    /** Force path-style addressing (usually required by MinIO) */
    s3_force_path_style?: boolean;

    // ========== Baidu Netdisk (application config) ==========
    baidu_app_id?: string;
    baidu_app_key?: string;
    baidu_secret_key?: string;

    // ========== TCP-proxy FileCat ==========
    /** Proxy client id (matches the id in tcp_proxy_server_client) */
    tcp_client_num_id?: string;
    /** base_url of the remote FileCat (required when the remote has one, otherwise URLs mismatch) */
    tcp_base_url?: string;
}

/**
 * Credential types.
 * They map one-to-one to driver types and are all managed in Credential Management.
 * baidu takes two steps: fill the application config first, then OAuth-authorize accounts (multiple allowed).
 * local is a local directory mapping: the credential stores local absolute paths that can be reused by many mounts.
 * tcp_proxy reaches a remote FileCat through a proxy client: the credential stores the client id,
 * while the remote account credentials live in accounts.
 */
export type CredentialType =
    | "webdav"
    | "ssh"        // SSH / SFTP
    | "smb"        // SMB / Windows share
    | "s3"
    | "local"      // Local directory (directory links inside filecat)
    | "baidu"      // Baidu Netdisk (credential = app config, accounts in accounts)
    | "tcp_proxy"; // TCP-proxy client (credential = client, remote accounts in accounts)

/** Credential field descriptor (drives dynamic form rendering in the settings page) */
export interface CredentialField {
    /** Field name on CredentialItem */
    key: string;
    label: string;
    type: "text" | "password" | "switch" | "textarea";
    required?: boolean;
    placeholder?: string;
    tip?: string;
    /**
     * The value comes from dynamic options instead of free text (currently only the
     * tcp_proxy client dropdown). The frontend renders a dropdown, options come from the backend.
     */
    options_source?: "tcp_client";
}

/** Credential type metadata */
export interface CredentialMeta {
    type: CredentialType;
    name: string;
    fields: CredentialField[];
    /**
     * This credential maintains a "name -> local path" mapping list instead of plain text fields.
     *
     * Local directories have no auth info, so one credential can register several frequently
     * used source directories and a mount simply picks one of them. This is the same concept as
     * multiple shares under one SMB credential or multiple buckets under one S3 credential.
     */
    sources?: boolean;
    /**
     * This credential maintains a multi-account list (accounts) instead of a single set of
     * username/password.
     *
     * Account fields are described by account_fields; mounting picks one entry via account_id and
     * build_config merges account_name/password (plus secret_key for S3) into the connection config.
     */
    accounts?: boolean;
    /** Fields each account must fill when accounts is true (note excluded) */
    account_fields?: CredentialField[];
    /** Field key identifying an account inside accounts (shown as the primary column in lists) */
    account_key?: string;
}

/**
 * Config field definitions for each credential type.
 * baidu fields are only for step 1 (application config); step 2 OAuth authorization is rendered
 * separately by the frontend.
 */
export const CREDENTIAL_META_LIST: CredentialMeta[] = [
    {
        type: "webdav",
        name: "WebDAV",
        fields: [
            {key: "webdav_url", label: "Service URL", type: "text", required: true, placeholder: "https://example.com/dav"},
        ],
        accounts: true,
        account_key: "account_name",
        account_fields: [
            {key: "account_name", label: "Username", type: "text"},
            {key: "password", label: "Password", type: "password", tip: "Use an app password for services like Nutstore or Synology"},
        ],
    },
    {
        type: "ssh",
        name: "SSH / SFTP",
        fields: [
            {key: "ssh_host", label: "Host", type: "text", required: true},
            {key: "ssh_port", label: "Port", type: "text", placeholder: "Default 22"},
        ],
        accounts: true,
        account_key: "account_name",
        account_fields: [
            {key: "account_name", label: "Username", type: "text", required: true},
            {key: "password", label: "Password", type: "password", tip: "Can be left empty when a private key is set"},
            {key: "private_key", label: "Private key", type: "textarea", tip: "Takes precedence over the password when filled"},
        ],
    },
    {
        type: "smb",
        name: "SMB / Windows share",
        fields: [
            {key: "smb_server", label: "Host", type: "text", required: true, placeholder: "192.168.1.10 or nas.local"},
        ],
        accounts: true,
        account_key: "account_name",
        account_fields: [
            {key: "account_name", label: "Username", type: "text"},
            {key: "password", label: "Password", type: "password"},
        ],
    },
    {
        type: "s3",
        name: "S3 compatible storage",
        fields: [
            {
                key: "s3_endpoint",
                label: "Endpoint",
                type: "text",
                required: true,
                placeholder: "https://s3.amazonaws.com",
                tip: "Use the endpoint of your provider, e.g. Alibaba OSS, Tencent COS or MinIO",
            },
            {key: "s3_region", label: "Region", type: "text", placeholder: "us-east-1"},
            {key: "s3_force_path_style", label: "Force path style", type: "switch", tip: "Usually required by MinIO"},
        ],
        accounts: true,
        account_key: "account_name",
        account_fields: [
            {key: "account_name", label: "AccessKey", type: "text", required: true},
            {key: "secret_key", label: "SecretKey", type: "password", required: true},
        ],
    },
    {
        // Baidu Netdisk step 1 application config; step 2 OAuth authorization is rendered by the frontend
        type: "baidu",
        name: "Baidu Netdisk",
        fields: [
            {key: "baidu_app_id", label: "AppID", type: "text"},
            {key: "baidu_app_key", label: "AppKey", type: "text", required: true},
            {key: "baidu_secret_key", label: "SecretKey", type: "password", required: true},
        ],
        accounts: true,
        account_key: "account_name",
        // 百度账号由 OAuth 产生，用户名和 token 由服务端写入，只有备注可改
        account_fields: [],
    },
    {
        // Local directories have no auth info; one credential registers several name -> path mappings
        type: "local",
        name: "Local directory",
        fields: [],
        sources: true,
    },
    {
        // TCP-proxy client: the credential stores the client, remote FileCat accounts live in accounts
        type: "tcp_proxy",
        name: "TCP proxy FileCat",
        fields: [
            {
                key: "tcp_client_num_id",
                label: "Proxy client",
                type: "text",
                required: true,
                options_source: "tcp_client",
                tip: "Pick one from the TCP proxy client list",
            },
            {
                key: "tcp_base_url",
                label: "Remote base_url",
                type: "text",
                placeholder: "/pre",
                tip: "Only needed when the remote FileCat has a base_url configured",
            },
        ],
        accounts: true,
        account_key: "account_name",
        account_fields: [
            {key: "account_name", label: "Username", type: "text", required: true},
            {key: "password", label: "Password", type: "password"},
        ],
    },
];

/** Get credential metadata by type */
export function get_credential_meta(type: CredentialType): CredentialMeta | undefined {
    return CREDENTIAL_META_LIST.find(v => v.type === type);
}

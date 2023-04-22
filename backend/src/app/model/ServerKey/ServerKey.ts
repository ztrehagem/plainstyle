import type { KeyObject } from "node:crypto";
import { generateKeyPair, type JsonWebKey } from "node:crypto";
import { importPKCS8, importSPKI, jwtVerify, SignJWT } from "jose";
import type { Brand } from "../../../utils/Brand.js";
import type { Result } from "../../../utils/Result.js";
import { AccessToken } from "../Session/AccessToken.js";
import { RefreshToken } from "../Session/RefreshToken.js";
import { InvalidParameterError } from "../../error/InvalidParameterError.js";
import { UserHandle } from "../User/UserHandle.js";
import { SessionId } from "../Session/SessionId.js";
import { Temporal } from "@js-temporal/polyfill";

declare const brand: unique symbol;

type JWT = string;

type IServerKey = {
  signAccessToken: (accessToken: AccessToken) => Promise<JWT>;
  signRefreshToken: (refreshToken: RefreshToken) => Promise<JWT>;
  verifyAccessToken: (
    accessTokenString: string
  ) => Promise<Result<AccessToken, InvalidParameterError>>;
  verifyRefreshToken: (
    refreshTokenString: string
  ) => Promise<Result<RefreshToken, InvalidParameterError>>;
};

export type ServerKey = Brand<IServerKey, typeof brand>;

export type Params = {
  readonly privateKeyPem: string;
  readonly publicKeyPem: string;
  readonly publicKeyDer: Buffer;
  readonly publicKeyJwk: JsonWebKey;
};

const ALG = "EdDSA";

export const ServerKey = ({
  privateKeyPem,
  publicKeyPem,
  publicKeyDer,
  publicKeyJwk,
}: Params): ServerKey => {
  return {
    signAccessToken: async (token) => {
      const privateKey = await importPKCS8(privateKeyPem, ALG);

      return await new SignJWT({
        iss: token.issuer,
        aud: [...token.audience],
        sub: token.userHandle.value,
        sid: token.sessionId.value,
        scope: token.scopes.join(" "),
        iat: token.issuedAt.epochMilliseconds,
        exp: token.expiredAt.epochMilliseconds,
      })
        .setProtectedHeader({ alg: ALG })
        .sign(privateKey);
    },

    signRefreshToken: async (token) => {
      const privateKey = await importPKCS8(privateKeyPem, ALG);

      return await new SignJWT({
        iss: token.issuer,
        aud: [...token.audience],
        sub: token.userHandle.value,
        sid: token.sessionId.value,
        scope: token.scopes.join(" "),
        iat: token.issuedAt.epochMilliseconds,
        exp: token.expiredAt.epochMilliseconds,
      })
        .setProtectedHeader({ alg: ALG })
        .sign(privateKey);
    },

    verifyAccessToken: async (jwt) => {
      const publicKey = await importSPKI(publicKeyPem, ALG);
      const { payload } = await jwtVerify(jwt, publicKey);

      if (payload.iss == null) {
        return [new InvalidParameterError(ServerKey, "no iss claim is given")];
      }

      if (payload.sub == null) {
        return [new InvalidParameterError(ServerKey, "no sub claim is given")];
      }

      const [eUserHandle, userHandle] = UserHandle(payload.sub);

      if (eUserHandle) {
        return [eUserHandle];
      }

      if (typeof payload.sid != "string") {
        return [new InvalidParameterError(ServerKey, "no sid claim is given")];
      }

      if (typeof payload.scope != "string") {
        return [
          new InvalidParameterError(ServerKey, "no scope claim is given"),
        ];
      }

      if (payload.iat == null) {
        return [new InvalidParameterError(ServerKey, "no iat claim is given")];
      }

      if (payload.exp == null) {
        return [new InvalidParameterError(ServerKey, "no exp claim is given")];
      }

      const accessToken = AccessToken({
        issuer: payload.iss,
        audience: [payload.aud ?? []].flat(),
        userHandle,
        sessionId: SessionId(payload.sid),
        scopes: payload.scope.split(" "),
        issuedAt: Temporal.Instant.fromEpochMilliseconds(payload.iat),
        expiredAt: Temporal.Instant.fromEpochMilliseconds(payload.exp),
      });

      return [null, accessToken];
    },

    verifyRefreshToken: async (jwt) => {
      const publicKey = await importSPKI(publicKeyPem, ALG);
      const { payload } = await jwtVerify(jwt, publicKey);

      if (payload.iss == null) {
        return [new InvalidParameterError(ServerKey, "no iss claim is given")];
      }

      if (payload.sub == null) {
        return [new InvalidParameterError(ServerKey, "no sub claim is given")];
      }

      const [eUserHandle, userHandle] = UserHandle(payload.sub);

      if (eUserHandle) {
        return [eUserHandle];
      }

      if (typeof payload.sid != "string") {
        return [new InvalidParameterError(ServerKey, "no sid claim is given")];
      }

      if (typeof payload.scope != "string") {
        return [
          new InvalidParameterError(ServerKey, "no scope claim is given"),
        ];
      }

      if (payload.iat == null) {
        return [new InvalidParameterError(ServerKey, "no iat claim is given")];
      }

      if (payload.exp == null) {
        return [new InvalidParameterError(ServerKey, "no exp claim is given")];
      }

      const [eAccessToken, accessToken] = RefreshToken({
        issuer: payload.iss,
        audience: [payload.aud ?? []].flat(),
        userHandle,
        sessionId: SessionId(payload.sid),
        scopes: payload.scope.split(" "),
        issuedAt: Temporal.Instant.fromEpochMilliseconds(payload.iat),
        expiredAt: Temporal.Instant.fromEpochMilliseconds(payload.exp),
      });

      if (eAccessToken) {
        return [eAccessToken];
      }

      return [null, accessToken];
    },
  } satisfies IServerKey as ServerKey;
};

ServerKey.generateParams = async (): Promise<Params> => {
  const { privateKey, publicKey } = await new Promise<{
    privateKey: KeyObject;
    publicKey: KeyObject;
  }>((resolve, reject) => {
    generateKeyPair("ed25519", {}, (error, publicKey, privateKey) =>
      error ? reject(error) : resolve({ publicKey, privateKey })
    );
  });

  const privateKeyPem = privateKey
    .export({ format: "pem", type: "pkcs8" })
    .toString();
  const publicKeyPem = publicKey
    .export({ format: "pem", type: "spki" })
    .toString();
  const publicKeyDer = publicKey.export({ format: "der", type: "spki" });
  const publicKeyJwk = publicKey.export({ format: "jwk" });

  return {
    privateKeyPem,
    publicKeyPem,
    publicKeyDer,
    publicKeyJwk,
  };
};

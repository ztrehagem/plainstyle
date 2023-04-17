import type { RouteHandlerMethod } from "fastify";
import type { RequestPayload, ResponsePayload } from "@flatnavy/api";
import type { Context } from "../../context.js";
import { UserHandle } from "../../model/User/UserHandle.js";
import { User } from "../../model/User/User.js";
import { UserRegistration } from "../../model/User/UserRegistration.js";
import { HashedUserPassword } from "../../model/User/HashedUserPassword.js";
import { UserId } from "../../model/User/UserId.js";

export const createUser =
  ({
    userRepository,
    sessionRepository,
    serverKeyRepository,
  }: Context): RouteHandlerMethod =>
  async (req, reply) => {
    const body = req.body as RequestPayload<
      "/api/users",
      "post"
    >["application/json"];

    const [eHandle, handle] = UserHandle(body.handle);

    if (eHandle) {
      return await reply.status(400).send();
    }

    const [eUser, user] = User({
      id: UserId.placeholder(),
      handle,
      name: body.name,
    });

    if (eUser) {
      return await reply.status(400).send();
    }

    const [ePassword, password] = await HashedUserPassword.hash(body.password);

    if (ePassword) {
      return await reply.status(400).send();
    }

    const registration = UserRegistration({ user, password });
    const [error, createdUser] = await userRepository.create(registration);

    if (error) {
      return await reply.status(409).send();
    }

    const serverKey = await serverKeyRepository.get();
    const [accessToken, refreshToken] = await sessionRepository.createSession({
      user,
    });
    const accessTokenJwt = await serverKey.signAccessToken(accessToken);
    const refreshTokenJwt = await serverKey.signRefreshToken(refreshToken);

    const res: ResponsePayload<
      "/api/users",
      "post"
    >["201"]["application/json"] = {
      user: {
        handle: createdUser.handle.value,
        name: createdUser.name,
      },
      accessToken: accessTokenJwt,
      refreshToken: refreshTokenJwt,
    };

    await reply.status(201).type("application/json").send(res);
  };
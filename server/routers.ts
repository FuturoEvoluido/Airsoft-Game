import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { insertUserFile, listUserFiles } from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { storagePut } from "./storage";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  files: router({
    list: protectedProcedure.query(({ ctx }) => listUserFiles(ctx.user.id)),
    upload: protectedProcedure
      .input(z.object({
        fileName: z.string().trim().min(1).max(255),
        mimeType: z.string().trim().min(1).max(120),
        size: z.number().int().positive().max(10_000_000),
        data: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        if (/text\/html|javascript|x-executable/i.test(input.mimeType)) {
          throw new Error("Este tipo de arquivo não é permitido");
        }
        const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 180) || "arquivo";
        const buffer = Buffer.from(input.data, "base64");
        if (buffer.byteLength !== input.size) throw new Error("O tamanho do arquivo não confere");
        const stored = await storagePut(`operator-files/${ctx.user.id}/${Date.now()}-${safeName}`, buffer, input.mimeType);
        return insertUserFile({ userId: ctx.user.id, fileName: input.fileName, fileKey: stored.key, url: stored.url, mimeType: input.mimeType, size: input.size });
      }),
  }),

  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

export type AppRouter = typeof appRouter;

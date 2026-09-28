import { createFunctions } from "meowapps/functions";

export const { api, emulator } = createFunctions({
  "/api/hello": (req, res, { shopId }) => res.json({ shopId }),
});

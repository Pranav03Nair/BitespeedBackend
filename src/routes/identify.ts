import { Router } from "express";
import { IdentifyContact } from "../controllers/identifyController";

const router = Router();

router.post("/", IdentifyContact);

export default router;

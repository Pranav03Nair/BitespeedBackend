import { Request, Response } from "express";
import prisma from "../lib/prisma";

export const IdentifyContact = async (req: Request, res: Response) => {
  try {
    const { email, phoneNumber } = req.body;

    if (!email && !phoneNumber) {
      return res.status(400).json({
        error: "Incomplete Request: Both email and phoneNumber fields empty",
      });
    }

    // Step 1: Fetch primary contacts (if any)
    const matchingPrimaryContacts = await prisma.contact.findMany({
      where: {
        linkPrecedence: "primary",
        OR: [
          { email: email || undefined },
          { phoneNumber: phoneNumber || undefined },
        ],
      },
    });

    // Deduplicate
    const uniqueContactsMap = new Map();
    matchingPrimaryContacts.forEach((contact) => {
      uniqueContactsMap.set(contact.id, contact);
    });
    const uniquePrimaryContacts = Array.from(uniqueContactsMap.values());

    // If none, Create object
    if (uniquePrimaryContacts.length === 0) {
      const newPrimaryContact = await prisma.contact.create({
        data: {
          phoneNumber,
          email,
          linkPrecedence: "primary",
          linkedId: null, // Primary contact has no linkedId
        },
      });

      return res.status(200).json({
        contact: {
          primaryContatctId: newPrimaryContact.id,
          emails: [newPrimaryContact.email].filter(Boolean),
          phoneNumbers: [newPrimaryContact.phoneNumber].filter(Boolean),
          secondaryContactIds: [],
        },
      });
    }

    // Step 2:

    return res.status(200).json({
      message: "Matching primary contacts fetched successfully",
      data: uniquePrimaryContacts,
    });

    /*
    {
      "contact":{
      "primaryContatctId": number,
      "emails": string[], // first element being email of primary contact
      "phoneNumbers": string[], // first element being phoneNumber of primary
      "secondaryContactIds": number[] // Array of all Contact IDs that are "seco
      }
    }
    */
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server Error" });
  }
};

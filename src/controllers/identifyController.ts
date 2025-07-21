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
      orderBy: { createdAt: "asc" },
    });

    // Deduplicate
    const uniqueContactsMap = new Map();
    matchingPrimaryContacts.forEach((contact) => {
      uniqueContactsMap.set(contact.id, contact);
    });
    const uniquePrimaryContacts = Array.from(uniqueContactsMap.values());

    // Step 2: If no primaries, Create new entry
    if (uniquePrimaryContacts.length === 0) {
      const newPrimaryContact = await prisma.contact.create({
        data: {
          phoneNumber,
          email,
          linkPrecedence: "primary",
          linkedId: null,
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

    // Step 3: One or two primaries exist
    if (uniquePrimaryContacts.length === 1) {
      const primary = uniquePrimaryContacts[0];

      const allLinkedContacts = await prisma.contact.findMany({
        where: {
          OR: [{ id: primary.id }, { linkedId: primary.id }],
        },
      });

      // Get all possible emails and phones
      const knownEmails = new Set(
        allLinkedContacts.map((c) => c.email).filter(Boolean)
      );
      const knownPhones = new Set(
        allLinkedContacts.map((c) => c.phoneNumber).filter(Boolean)
      );

      const isNewEmail = email && !knownEmails.has(email);
      const isNewPhone = phoneNumber && !knownPhones.has(phoneNumber);

      // IMP - Flatten to prevent tree
      const truePrimaryId = primary.linkedId ?? primary.id;

      if (isNewEmail || isNewPhone) {
        await prisma.contact.create({
          data: {
            email,
            phoneNumber,
            linkPrecedence: "secondary",
            linkedId: truePrimaryId,
          },
        });
      }
    } else if (uniquePrimaryContacts.length === 2) {
      const [primary1, primary2] = uniquePrimaryContacts;

      // Demote primary2 (Note - We have already ordered using ascending above)
      await prisma.contact.update({
        where: { id: primary2.id },
        data: {
          linkPrecedence: "secondary",
          linkedId: primary1.id,
        },
      });

      // Flatten to prevent tree
      await prisma.contact.updateMany({
        where: { linkedId: primary2.id },
        data: { linkedId: primary1.id },
      });
    }

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

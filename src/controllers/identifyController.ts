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

    const matchedContacts = await prisma.contact.findMany({
      where: {
        OR: [
          { email: email || undefined },
          { phoneNumber: phoneNumber || undefined },
        ],
      },
      orderBy: { createdAt: "asc" },
    });

    // Unique Primaries
    const uniquePrimaryContactsMap = new Map<
      number,
      (typeof matchedContacts)[0]
    >();

    for (const contact of matchedContacts) {
      const rootId = contact.linkedId ?? contact.id;
      if (!uniquePrimaryContactsMap.has(rootId)) {
        const primary =
          contact.linkPrecedence === "primary"
            ? contact
            : await prisma.contact.findUnique({ where: { id: rootId } });
        uniquePrimaryContactsMap.set(rootId, primary!);
      }
    }

    const uniquePrimaryContacts = Array.from(uniquePrimaryContactsMap.values());

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

    let truePrimaryId: number;
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
      truePrimaryId = primary.linkedId ?? primary.id;

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
      truePrimaryId = primary1.id;

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

    truePrimaryId ??= uniquePrimaryContacts[0].id; // Else assignment error

    // Step 4: Aggregate and Fire the response!
    const relatedContacts = await prisma.contact.findMany({
      where: {
        OR: [{ id: truePrimaryId }, { linkedId: truePrimaryId }],
      },
      orderBy: { createdAt: "asc" },
    });

    const emailsSet = new Set<string>();
    const phoneNumbersSet = new Set<string>();
    const secondaryContactIds: number[] = [];

    let primaryEmail = "";
    let primaryPhone = "";

    for (const contact of relatedContacts) {
      if (contact.linkPrecedence === "primary") {
        if (contact.email) primaryEmail = contact.email;
        if (contact.phoneNumber) primaryPhone = contact.phoneNumber;
      } else {
        if (contact.email) emailsSet.add(contact.email);
        if (contact.phoneNumber) phoneNumbersSet.add(contact.phoneNumber);
        secondaryContactIds.push(contact.id);
      }
    }

    // Optional Enhancement - To keep the primary id mail and number first in the list
    const emails = primaryEmail
      ? [
          primaryEmail,
          ...Array.from(emailsSet).filter((e) => e !== primaryEmail),
        ]
      : Array.from(emailsSet);
    const phoneNumbers = primaryPhone
      ? [
          primaryPhone,
          ...Array.from(phoneNumbersSet).filter((p) => p !== primaryPhone),
        ]
      : Array.from(phoneNumbersSet);

    return res.status(200).json({
      contact: {
        primaryContatctId: truePrimaryId,
        emails,
        phoneNumbers,
        secondaryContactIds,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server Error" });
  }
};

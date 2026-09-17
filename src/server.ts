import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "./lib/prisma.js";

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "../public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "MYC Connect API", version: "0.2.0" });
});


app.get("/api/dashboard", async (_req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const [
      totalOrganizations,
      newLeadsThisMonth,
      activeOpportunities,
      openMatches,
      ecuadorToEurope,
      europeToEcuador,
      overdueFollowUps,
      dueTodayFollowUps,
      upcomingFollowUps,
      clientsWon,
      proposalsSent,
      meetingsTotal,
      recentOrganizations,
      pipelineGroups,
      sectorGroups,
      countryGroups,
      potentialGroups
    ] = await Promise.all([
      prisma.organization.count(),
      prisma.organization.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.opportunity.count({
        where: {
          stage: {
            notIn: ["CLIENT", "CLOSED", "NOT_INTERESTED", "NOT_QUALIFIED"]
          }
        }
      }),
      prisma.match.count({ where: { status: { not: "CLOSED" } } }),
      prisma.organization.count({ where: { direction: "ECUADOR_TO_EUROPE" } }),
      prisma.organization.count({ where: { direction: "EUROPE_TO_ECUADOR" } }),
      prisma.task.count({
        where: {
          completed: false,
          dueDate: { lt: now }
        }
      }),
      prisma.task.count({
        where: {
          completed: false,
          dueDate: { gte: now, lte: endOfToday }
        }
      }),
      prisma.task.count({
        where: {
          completed: false,
          dueDate: { gt: endOfToday }
        }
      }),
      prisma.organization.count({ where: { pipelineStage: "CLIENT" } }),
      prisma.opportunity.count({
        where: { stage: { in: ["PROPOSAL", "NEGOTIATION", "CLIENT"] } }
      }),
      prisma.interaction.count({ where: { type: "MEETING" } }),
      prisma.organization.findMany({
        orderBy: { createdAt: "desc" },
        take: 8
      }),
      prisma.organization.groupBy({
        by: ["pipelineStage"],
        _count: { _all: true }
      }),
      prisma.organization.groupBy({
        by: ["sector"],
        _count: { _all: true },
        orderBy: { _count: { sector: "desc" } },
        take: 6
      }),
      prisma.organization.groupBy({
        by: ["country"],
        _count: { _all: true },
        orderBy: { _count: { country: "desc" } },
        take: 6
      }),
      prisma.organization.groupBy({
        by: ["strategicPotential"],
        _count: { _all: true }
      })
    ]);

    res.json({
      totalOrganizations,
      newLeadsThisMonth,
      activeOpportunities,
      meetingsTotal,
      proposalsSent,
      clientsWon,
      ecuadorToEurope,
      europeToEcuador,
      openMatches,
      overdueFollowUps,
      dueTodayFollowUps,
      upcomingFollowUps,
      recentOrganizations,
      pipeline: pipelineGroups.map(x => ({
        stage: x.pipelineStage,
        count: x._count._all
      })),
      topSectors: sectorGroups.map(x => ({
        label: x.sector,
        count: x._count._all
      })),
      topCountries: countryGroups.map(x => ({
        label: x.country,
        count: x._count._all
      })),
      strategicPotential: potentialGroups.map(x => ({
        level: x.strategicPotential || "UNDEFINED",
        count: x._count._all
      }))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo cargar el dashboard." });
  }
});

app.get("/api/organizations", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const country = String(req.query.country || "").trim();
    const direction = String(req.query.direction || "").trim();
    const sector = String(req.query.sector || "").trim();
    const need = String(req.query.need || "").trim();
    const leadSource = String(req.query.leadSource || "").trim();
    const pipelineStage = String(req.query.pipelineStage || "").trim();
    const strategicPotential = String(req.query.strategicPotential || "").trim();
    const followUpFrom = String(req.query.followUpFrom || "").trim();
    const followUpTo = String(req.query.followUpTo || "").trim();

    const where: any = {};

    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { country: { contains: q, mode: "insensitive" } },
        { cityRegion: { contains: q, mode: "insensitive" } },
        { sector: { contains: q, mode: "insensitive" } },
        { subsector: { contains: q, mode: "insensitive" } },
        { offerSummary: { contains: q, mode: "insensitive" } },
        { leadSource: { contains: q, mode: "insensitive" } },
        { nextAction: { contains: q, mode: "insensitive" } }
      ];
    }

    if (country) where.country = { equals: country, mode: "insensitive" };
    if (direction) where.direction = direction;
    if (sector) where.sector = { equals: sector, mode: "insensitive" };
    if (need) where.needs = { has: need };
    if (leadSource) where.leadSource = { equals: leadSource, mode: "insensitive" };
    if (pipelineStage) where.pipelineStage = pipelineStage;
    if (strategicPotential) where.strategicPotential = strategicPotential;

    if (followUpFrom || followUpTo) {
      where.nextActionDate = {};
      if (followUpFrom) where.nextActionDate.gte = new Date(followUpFrom);
      if (followUpTo) {
        const to = new Date(followUpTo);
        to.setHours(23, 59, 59, 999);
        where.nextActionDate.lte = to;
      }
    }

    const items = await prisma.organization.findMany({
      where,
      orderBy: [
        { nextActionDate: "asc" },
        { createdAt: "desc" }
      ],
      take: 500
    });

    res.json(items);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudieron cargar las organizaciones." });
  }
});

app.get("/api/organizations/filter-options", async (_req, res) => {
  try {
    const organizations = await prisma.organization.findMany({
      select: {
        country: true,
        sector: true,
        needs: true,
        leadSource: true
      }
    });

    const unique = (values: string[]) =>
      [...new Set(values.filter(Boolean).map(v => v.trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));

    res.json({
      countries: unique(organizations.map(x => x.country)),
      sectors: unique(organizations.map(x => x.sector)),
      needs: unique(organizations.flatMap(x => x.needs || [])),
      leadSources: unique(organizations.map(x => x.leadSource || ""))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudieron cargar las opciones de filtros." });
  }
});

app.get("/api/organizations/:id", async (req, res) => {
  try {
    const organization = await prisma.organization.findUnique({
      where: { id: req.params.id },
      include: {
        contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }] },
        interactions: { orderBy: { date: "desc" }, take: 50 },
        opportunities: { orderBy: { createdAt: "desc" } },
        tasks: { orderBy: [{ completed: "asc" }, { dueDate: "asc" }] },
        matchesAsA: {
          include: { organizationB: true },
          orderBy: { createdAt: "desc" }
        },
        matchesAsB: {
          include: { organizationA: true },
          orderBy: { createdAt: "desc" }
        }
      }
    });

    if (!organization) {
      return res.status(404).json({ error: "Organización no encontrada." });
    }

    res.json(organization);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo cargar el perfil de la organización." });
  }
});

app.post("/api/organizations", async (req, res) => {
  try {
    const {
      name, organizationType, country, cityRegion, website, linkedin, instagram,
      direction, sector, subsector, offerSummary, needs = [], currentMarkets = [],
      targetMarkets = [], strategicPotential, leadSource, pipelineStage = "IDENTIFIED",
      nextAction, nextActionDate
    } = req.body;

    if (!name || !organizationType || !country || !direction || !sector) {
      return res.status(400).json({
        error: "Faltan campos obligatorios: nombre, tipo, país, dirección y sector."
      });
    }

    const duplicate = await prisma.organization.findUnique({
      where: { name_country: { name, country } }
    });

    if (duplicate) {
      return res.status(409).json({
        error: "Ya existe una organización con ese nombre y país."
      });
    }

    const organization = await prisma.organization.create({
      data: {
        name,
        organizationType,
        country,
        cityRegion: cityRegion || null,
        website: website || null,
        linkedin: linkedin || null,
        instagram: instagram || null,
        direction,
        sector,
        subsector: subsector || null,
        offerSummary: offerSummary || null,
        needs,
        currentMarkets,
        targetMarkets,
        strategicPotential: strategicPotential || null,
        leadSource: leadSource || null,
        pipelineStage,
        nextAction: nextAction || null,
        nextActionDate: nextActionDate ? new Date(nextActionDate) : null
      }
    });

    res.status(201).json(organization);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo crear la organización." });
  }
});

app.put("/api/organizations/:id", async (req, res) => {
  try {
    const existing = await prisma.organization.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Organización no encontrada." });

    const {
      name, organizationType, country, cityRegion, website, linkedin, instagram,
      direction, sector, subsector, offerSummary, needs = [], currentMarkets = [],
      targetMarkets = [], strategicPotential, leadSource, pipelineStage,
      nextAction, nextActionDate
    } = req.body;

    if (!name || !organizationType || !country || !direction || !sector) {
      return res.status(400).json({
        error: "Faltan campos obligatorios: nombre, tipo, país, dirección y sector."
      });
    }

    if (name !== existing.name || country !== existing.country) {
      const duplicate = await prisma.organization.findUnique({
        where: { name_country: { name, country } }
      });
      if (duplicate && duplicate.id !== existing.id) {
        return res.status(409).json({
          error: "Ya existe otra organización con ese nombre y país."
        });
      }
    }

    const updated = await prisma.organization.update({
      where: { id: req.params.id },
      data: {
        name,
        organizationType,
        country,
        cityRegion: cityRegion || null,
        website: website || null,
        linkedin: linkedin || null,
        instagram: instagram || null,
        direction,
        sector,
        subsector: subsector || null,
        offerSummary: offerSummary || null,
        needs,
        currentMarkets,
        targetMarkets,
        strategicPotential: strategicPotential || null,
        leadSource: leadSource || null,
        pipelineStage: pipelineStage || existing.pipelineStage,
        nextAction: nextAction || null,
        nextActionDate: nextActionDate ? new Date(nextActionDate) : null
      }
    });

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo actualizar la organización." });
  }
});


app.get("/api/contacts", async (_req, res) => {
  try {
    const contacts = await prisma.contact.findMany({
      include: { organization: true },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }]
    });
    res.json(contacts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudieron cargar los contactos." });
  }
});

app.post("/api/organizations/:organizationId/contacts", async (req, res) => {
  try {
    const organization = await prisma.organization.findUnique({
      where: { id: req.params.organizationId }
    });

    if (!organization) {
      return res.status(404).json({ error: "Organización no encontrada." });
    }

    const {
      firstName,
      lastName,
      jobTitle,
      email,
      phoneWhatsapp,
      linkedin,
      preferredLanguage,
      notes,
      isPrimary = false
    } = req.body;

    if (!firstName || !lastName) {
      return res.status(400).json({ error: "Nombre y apellido son obligatorios." });
    }

    if (isPrimary) {
      await prisma.contact.updateMany({
        where: { organizationId: req.params.organizationId, isPrimary: true },
        data: { isPrimary: false }
      });
    }

    const contact = await prisma.contact.create({
      data: {
        organizationId: req.params.organizationId,
        firstName,
        lastName,
        jobTitle: jobTitle || null,
        email: email || null,
        phoneWhatsapp: phoneWhatsapp || null,
        linkedin: linkedin || null,
        preferredLanguage: preferredLanguage || null,
        notes: notes || null,
        isPrimary: Boolean(isPrimary)
      }
    });

    res.status(201).json(contact);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo crear el contacto." });
  }
});

app.put("/api/contacts/:id", async (req, res) => {
  try {
    const existing = await prisma.contact.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Contacto no encontrado." });

    const {
      firstName,
      lastName,
      jobTitle,
      email,
      phoneWhatsapp,
      linkedin,
      preferredLanguage,
      notes,
      isPrimary = false
    } = req.body;

    if (!firstName || !lastName) {
      return res.status(400).json({ error: "Nombre y apellido son obligatorios." });
    }

    if (isPrimary) {
      await prisma.contact.updateMany({
        where: {
          organizationId: existing.organizationId,
          isPrimary: true,
          NOT: { id: existing.id }
        },
        data: { isPrimary: false }
      });
    }

    const contact = await prisma.contact.update({
      where: { id: req.params.id },
      data: {
        firstName,
        lastName,
        jobTitle: jobTitle || null,
        email: email || null,
        phoneWhatsapp: phoneWhatsapp || null,
        linkedin: linkedin || null,
        preferredLanguage: preferredLanguage || null,
        notes: notes || null,
        isPrimary: Boolean(isPrimary)
      }
    });

    res.json(contact);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo actualizar el contacto." });
  }
});

app.delete("/api/contacts/:id", async (req, res) => {
  try {
    await prisma.contact.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo eliminar el contacto." });
  }
});



app.post("/api/organizations/:organizationId/interactions", async (req, res) => {
  try {
    const organization = await prisma.organization.findUnique({ where: { id: req.params.organizationId } });
    if (!organization) return res.status(404).json({ error: "Organización no encontrada." });

    const { date, type, note, responsible, attachmentUrl, nextAction, deadline } = req.body;
    if (!type || !note) return res.status(400).json({ error: "Tipo y resultado/nota son obligatorios." });

    const interactionDate = date ? new Date(date) : new Date();
    const interaction = await prisma.interaction.create({
      data: {
        organizationId: req.params.organizationId,
        date: interactionDate,
        type,
        note,
        responsible: responsible || null,
        attachmentUrl: attachmentUrl || null,
        nextAction: nextAction || null,
        deadline: deadline ? new Date(deadline) : null
      }
    });

    await prisma.organization.update({
      where: { id: req.params.organizationId },
      data: {
        lastInteractionAt: interactionDate,
        ...(nextAction ? { nextAction } : {}),
        ...(deadline ? { nextActionDate: new Date(deadline) } : {})
      }
    });

    res.status(201).json(interaction);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo registrar la interacción." });
  }
});

app.put("/api/interactions/:id", async (req, res) => {
  try {
    const existing = await prisma.interaction.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Interacción no encontrada." });

    const { date, type, note, responsible, attachmentUrl, nextAction, deadline } = req.body;
    if (!type || !note) return res.status(400).json({ error: "Tipo y resultado/nota son obligatorios." });

    const interactionDate = date ? new Date(date) : existing.date;
    const updated = await prisma.interaction.update({
      where: { id: req.params.id },
      data: {
        date: interactionDate,
        type,
        note,
        responsible: responsible || null,
        attachmentUrl: attachmentUrl || null,
        nextAction: nextAction || null,
        deadline: deadline ? new Date(deadline) : null
      }
    });

    const latest = await prisma.interaction.findFirst({
      where: { organizationId: existing.organizationId },
      orderBy: { date: "desc" }
    });

    await prisma.organization.update({
      where: { id: existing.organizationId },
      data: {
        lastInteractionAt: latest?.date || null,
        ...(nextAction ? { nextAction } : {}),
        ...(deadline ? { nextActionDate: new Date(deadline) } : {})
      }
    });

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo actualizar la interacción." });
  }
});

app.delete("/api/interactions/:id", async (req, res) => {
  try {
    const existing = await prisma.interaction.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Interacción no encontrada." });

    await prisma.interaction.delete({ where: { id: req.params.id } });

    const latest = await prisma.interaction.findFirst({
      where: { organizationId: existing.organizationId },
      orderBy: { date: "desc" }
    });

    await prisma.organization.update({
      where: { id: existing.organizationId },
      data: { lastInteractionAt: latest?.date || null }
    });

    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo eliminar la interacción." });
  }
});


app.get("/api/opportunities", async (_req, res) => {
  try {
    const opportunities = await prisma.opportunity.findMany({
      include: { organization: true },
      orderBy: { createdAt: "desc" }
    });
    res.json(opportunities);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudieron cargar las oportunidades." });
  }
});

app.post("/api/organizations/:organizationId/opportunities", async (req, res) => {
  try {
    const organization = await prisma.organization.findUnique({
      where: { id: req.params.organizationId }
    });

    if (!organization) {
      return res.status(404).json({ error: "Organización no encontrada." });
    }

    const {
      title,
      description,
      stage = "IDENTIFIED",
      nextAction,
      nextActionDate
    } = req.body;

    if (!title) {
      return res.status(400).json({ error: "El título de la oportunidad es obligatorio." });
    }

    const opportunity = await prisma.opportunity.create({
      data: {
        organizationId: req.params.organizationId,
        title,
        description: description || null,
        stage,
        nextAction: nextAction || null,
        nextActionDate: nextActionDate ? new Date(nextActionDate) : null
      }
    });

    await prisma.organization.update({
      where: { id: req.params.organizationId },
      data: {
        pipelineStage: stage,
        ...(nextAction ? { nextAction } : {}),
        ...(nextActionDate ? { nextActionDate: new Date(nextActionDate) } : {})
      }
    });

    res.status(201).json(opportunity);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo crear la oportunidad." });
  }
});

app.put("/api/opportunities/:id", async (req, res) => {
  try {
    const existing = await prisma.opportunity.findUnique({
      where: { id: req.params.id }
    });

    if (!existing) {
      return res.status(404).json({ error: "Oportunidad no encontrada." });
    }

    const {
      title,
      description,
      stage,
      nextAction,
      nextActionDate
    } = req.body;

    if (!title || !stage) {
      return res.status(400).json({ error: "Título y etapa son obligatorios." });
    }

    const opportunity = await prisma.opportunity.update({
      where: { id: req.params.id },
      data: {
        title,
        description: description || null,
        stage,
        nextAction: nextAction || null,
        nextActionDate: nextActionDate ? new Date(nextActionDate) : null
      }
    });

    await prisma.organization.update({
      where: { id: existing.organizationId },
      data: {
        pipelineStage: stage,
        ...(nextAction ? { nextAction } : {}),
        ...(nextActionDate ? { nextActionDate: new Date(nextActionDate) } : {})
      }
    });

    res.json(opportunity);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo actualizar la oportunidad." });
  }
});

app.patch("/api/opportunities/:id/stage", async (req, res) => {
  try {
    const existing = await prisma.opportunity.findUnique({
      where: { id: req.params.id }
    });

    if (!existing) {
      return res.status(404).json({ error: "Oportunidad no encontrada." });
    }

    const { stage } = req.body;
    if (!stage) {
      return res.status(400).json({ error: "La etapa es obligatoria." });
    }

    const opportunity = await prisma.opportunity.update({
      where: { id: req.params.id },
      data: { stage }
    });

    await prisma.organization.update({
      where: { id: existing.organizationId },
      data: { pipelineStage: stage }
    });

    res.json(opportunity);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo cambiar la etapa." });
  }
});

app.delete("/api/opportunities/:id", async (req, res) => {
  try {
    await prisma.opportunity.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo eliminar la oportunidad." });
  }
});



app.get("/api/matches", async (_req, res) => {
  try {
    const matches = await prisma.match.findMany({
      include: {
        organizationA: true,
        organizationB: true
      },
      orderBy: { createdAt: "desc" }
    });
    res.json(matches);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudieron cargar los matches." });
  }
});

app.post("/api/matches", async (req, res) => {
  try {
    const {
      organizationAId,
      organizationBId,
      reason,
      needOffer,
      status = "POTENTIAL",
      mycRole,
      nextAction,
      notes
    } = req.body;

    if (!organizationAId || !organizationBId || !reason) {
      return res.status(400).json({
        error: "Organización A, Organización B y motivo del match son obligatorios."
      });
    }

    if (organizationAId === organizationBId) {
      return res.status(400).json({
        error: "No se puede crear un match de una organización consigo misma."
      });
    }

    const duplicate = await prisma.match.findFirst({
      where: {
        OR: [
          { organizationAId, organizationBId },
          { organizationAId: organizationBId, organizationBId: organizationAId }
        ]
      }
    });

    if (duplicate) {
      return res.status(409).json({
        error: "Ya existe un match entre estas dos organizaciones."
      });
    }

    const match = await prisma.match.create({
      data: {
        organizationAId,
        organizationBId,
        reason,
        needOffer: needOffer || null,
        status,
        mycRole: mycRole || null,
        nextAction: nextAction || null,
        notes: notes || null
      },
      include: {
        organizationA: true,
        organizationB: true
      }
    });

    res.status(201).json(match);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo crear el match." });
  }
});

app.put("/api/matches/:id", async (req, res) => {
  try {
    const existing = await prisma.match.findUnique({
      where: { id: req.params.id }
    });

    if (!existing) {
      return res.status(404).json({ error: "Match no encontrado." });
    }

    const {
      organizationAId,
      organizationBId,
      reason,
      needOffer,
      status,
      mycRole,
      nextAction,
      notes
    } = req.body;

    if (!organizationAId || !organizationBId || !reason || !status) {
      return res.status(400).json({
        error: "Organizaciones, motivo y estado son obligatorios."
      });
    }

    if (organizationAId === organizationBId) {
      return res.status(400).json({
        error: "No se puede crear un match de una organización consigo misma."
      });
    }

    const duplicate = await prisma.match.findFirst({
      where: {
        id: { not: existing.id },
        OR: [
          { organizationAId, organizationBId },
          { organizationAId: organizationBId, organizationBId: organizationAId }
        ]
      }
    });

    if (duplicate) {
      return res.status(409).json({
        error: "Ya existe otro match entre estas dos organizaciones."
      });
    }

    const match = await prisma.match.update({
      where: { id: req.params.id },
      data: {
        organizationAId,
        organizationBId,
        reason,
        needOffer: needOffer || null,
        status,
        mycRole: mycRole || null,
        nextAction: nextAction || null,
        notes: notes || null
      },
      include: {
        organizationA: true,
        organizationB: true
      }
    });

    res.json(match);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo actualizar el match." });
  }
});

app.delete("/api/matches/:id", async (req, res) => {
  try {
    await prisma.match.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo eliminar el match." });
  }
});



app.get("/api/tasks", async (req, res) => {
  try {
    const status = String(req.query.status || "").trim();
    const now = new Date();

    const where: any = {};

    if (status === "pending") {
      where.completed = false;
    } else if (status === "completed") {
      where.completed = true;
    } else if (status === "overdue") {
      where.completed = false;
      where.dueDate = { lt: now };
    } else if (status === "upcoming") {
      where.completed = false;
      where.dueDate = { gte: now };
    }

    const tasks = await prisma.task.findMany({
      where,
      include: { organization: true },
      orderBy: [
        { completed: "asc" },
        { dueDate: "asc" },
        { createdAt: "desc" }
      ]
    });

    res.json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudieron cargar los seguimientos." });
  }
});

app.post("/api/tasks", async (req, res) => {
  try {
    const {
      organizationId,
      title,
      description,
      ownerName,
      dueDate
    } = req.body;

    if (!title) {
      return res.status(400).json({ error: "El título del seguimiento es obligatorio." });
    }

    if (organizationId) {
      const organization = await prisma.organization.findUnique({
        where: { id: organizationId }
      });

      if (!organization) {
        return res.status(404).json({ error: "Organización no encontrada." });
      }
    }

    const task = await prisma.task.create({
      data: {
        organizationId: organizationId || null,
        title,
        description: description || null,
        ownerName: ownerName || null,
        dueDate: dueDate ? new Date(dueDate) : null
      },
      include: { organization: true }
    });

    if (organizationId) {
      await prisma.organization.update({
        where: { id: organizationId },
        data: {
          nextAction: title,
          ...(dueDate ? { nextActionDate: new Date(dueDate) } : {})
        }
      });
    }

    res.status(201).json(task);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo crear el seguimiento." });
  }
});

app.put("/api/tasks/:id", async (req, res) => {
  try {
    const existing = await prisma.task.findUnique({
      where: { id: req.params.id }
    });

    if (!existing) {
      return res.status(404).json({ error: "Seguimiento no encontrado." });
    }

    const {
      organizationId,
      title,
      description,
      ownerName,
      dueDate,
      completed
    } = req.body;

    if (!title) {
      return res.status(400).json({ error: "El título del seguimiento es obligatorio." });
    }

    const task = await prisma.task.update({
      where: { id: req.params.id },
      data: {
        organizationId: organizationId || null,
        title,
        description: description || null,
        ownerName: ownerName || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        completed: Boolean(completed)
      },
      include: { organization: true }
    });

    if (organizationId && !completed) {
      await prisma.organization.update({
        where: { id: organizationId },
        data: {
          nextAction: title,
          ...(dueDate ? { nextActionDate: new Date(dueDate) } : {})
        }
      });
    }

    res.json(task);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo actualizar el seguimiento." });
  }
});

app.patch("/api/tasks/:id/toggle", async (req, res) => {
  try {
    const existing = await prisma.task.findUnique({
      where: { id: req.params.id }
    });

    if (!existing) {
      return res.status(404).json({ error: "Seguimiento no encontrado." });
    }

    const task = await prisma.task.update({
      where: { id: req.params.id },
      data: { completed: !existing.completed },
      include: { organization: true }
    });

    res.json(task);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo cambiar el estado del seguimiento." });
  }
});

app.delete("/api/tasks/:id", async (req, res) => {
  try {
    await prisma.task.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo eliminar el seguimiento." });
  }
});


app.use((_req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.listen(PORT, () => {
  console.log(`MYC Connect funcionando en http://localhost:${PORT}`);
});

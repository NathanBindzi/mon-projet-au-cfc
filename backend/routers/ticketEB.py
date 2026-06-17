# ════════════════════════════════════════════════════════
# TICKETS EB
# ════════════════════════════════════════════════════════

import io
import uuid as uuid_lib
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

# ── ReportLab ────────────────────────────────────────────
# On utilise le moteur bas niveau (canvas) plutôt que Platypus
# pour avoir un contrôle précis sur chaque pixel du document.
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.units import mm

from schemas.database import get_db
from models.models import (
    ActionLogEnum, Facture, Log, Utilisateur, TicketEB
)
from services.auth_service import get_utilisateur_actuel, verifier_role

router_tickets = APIRouter()


# ─────────────────────────────────────────────────────────────────────────────
# Utilitaire interne : génère le PDF en mémoire
# Retourne un objet BytesIO prêt à être streamé en réponse HTTP.
#
# On prend en paramètre toutes les données nécessaires pour que cette
# fonction reste pure (pas d'accès BD), ce qui la rend facile à tester.
# ─────────────────────────────────────────────────────────────────────────────

def _build_ticket_pdf(
    code_ticket:     str,
    reference_eb:    str,
    code_unique:     str,
    date_reception:  Optional[datetime],
    date_echeance:   Optional[object],   # date ou None
    expediteur:      Optional[str],
    numero_courrier: Optional[str],
    objet_courrier:  Optional[str],
    date_generation: datetime,
) -> io.BytesIO:
    """
    Construit le PDF du ticket EB et le retourne sous forme de BytesIO.

    Mise en page :
      - En-tête  : bandeau bleu marine avec le titre et le logo texte
      - Corps    : boîte de référence EB mise en valeur, grille de métadonnées
      - Pied     : zone de signatures + note officielle
    """

    buf = io.BytesIO()  # le PDF sera écrit dans ce buffer mémoire

    # Dimensions de la page A4 en points ReportLab (1 pt = 1/72 inch)
    PAGE_W, PAGE_H = A4          # 595 x 842 pts
    MARGIN         = 20 * mm     # marges gauche/droite = 20 mm
    CONTENT_W      = PAGE_W - 2 * MARGIN

    # ── Palette de couleurs du projet ─────────────────────────────────────────
    NAVY      = colors.HexColor("#1a3560")   # bleu marine (identité CFC)
    BLUE      = colors.HexColor("#1e63d0")   # bleu accent
    LIGHT_BG  = colors.HexColor("#f8fafc")   # fond gris très clair
    MUTED     = colors.HexColor("#5f7291")   # texte secondaire
    BORDER    = colors.HexColor("#dce4f0")   # bordures légères
    WHITE     = colors.white
    DARK      = colors.HexColor("#0f1e36")   # texte principal

    c = rl_canvas.Canvas(buf, pagesize=A4)

    # ── Helpers locaux ────────────────────────────────────────────────────────

    def draw_text(x, y, text, font="Helvetica", size=10, color=DARK):
        """Dessine une chaîne de texte à la position (x, y)."""
        c.setFont(font, size)
        c.setFillColor(color)
        c.drawString(x, y, text or "—")

    def draw_centered(x, y, w, text, font="Helvetica", size=10, color=DARK):
        """Dessine un texte centré dans une largeur w à partir de x."""
        c.setFont(font, size)
        c.setFillColor(color)
        c.drawCentredString(x + w / 2, y, text or "—")

    def draw_field(x, y, label, value, label_w=55*mm):
        """
        Affiche un champ étiquette + valeur sur une même ligne.
        label_w : largeur réservée à l'étiquette (la valeur commence après).
        """
        draw_text(x, y, label, size=8, color=MUTED)
        draw_text(x + label_w, y, str(value) if value else "—", size=9, color=DARK)

    def draw_rect_filled(x, y, w, h, fill, stroke=None, radius=4):
        """Dessine un rectangle arrondi avec fond coloré."""
        c.setFillColor(fill)
        if stroke:
            c.setStrokeColor(stroke)
            c.setLineWidth(0.5)
        else:
            c.setStrokeColor(fill)   # pas de bordure visible
        c.roundRect(x, y, w, h, radius, fill=1, stroke=1 if stroke else 0)

    # ════════════════════════════════════════════════════════════════════════
    # EN-TÊTE : bandeau bleu marine
    # ════════════════════════════════════════════════════════════════════════

    HEADER_H = 52 * mm
    draw_rect_filled(0, PAGE_H - HEADER_H, PAGE_W, HEADER_H, fill=NAVY)

    # Logo textuel "CFC SUIFACT"
    draw_centered(
        0, PAGE_H - 18*mm, PAGE_W,
        "CFC  SUIFACT",
        font="Helvetica-Bold", size=20, color=WHITE
    )

    # Sous-titre
    draw_centered(
        0, PAGE_H - 27*mm, PAGE_W,
        "Plateforme Partagée de Suivi des Factures",
        font="Helvetica", size=9,
        color=colors.HexColor("#aec6e8")   # bleu clair sur fond marine
    )

    # Titre du document
    draw_centered(
        0, PAGE_H - 40*mm, PAGE_W,
        "TICKET D'ENGAGEMENT BUDGÉTAIRE",
        font="Helvetica-Bold", size=13, color=WHITE
    )

    # ════════════════════════════════════════════════════════════════════════
    # BOÎTE RÉFÉRENCE EB — pièce centrale du document
    # ════════════════════════════════════════════════════════════════════════

    REF_BOX_Y = PAGE_H - HEADER_H - 52*mm
    REF_BOX_H = 38 * mm

    draw_rect_filled(
        MARGIN, REF_BOX_Y,
        CONTENT_W, REF_BOX_H,
        fill=NAVY, radius=6
    )

    # Libellé "Référence EB"
    draw_centered(
        MARGIN, REF_BOX_Y + 28*mm, CONTENT_W,
        "Référence EB",
        font="Helvetica", size=8,
        color=colors.HexColor("#7fa8d0")
    )

    # La référence elle-même, grande et bien lisible
    draw_centered(
        MARGIN, REF_BOX_Y + 14*mm, CONTENT_W,
        reference_eb,
        font="Helvetica-Bold", size=22, color=WHITE
    )

    # Code ticket en dessous, plus petit
    draw_centered(
        MARGIN, REF_BOX_Y + 5*mm, CONTENT_W,
        f"Code ticket : {code_ticket}",
        font="Helvetica", size=8,
        color=colors.HexColor("#aec6e8")
    )

    # ════════════════════════════════════════════════════════════════════════
    # GRILLE DE MÉTADONNÉES — 2 colonnes
    # ════════════════════════════════════════════════════════════════════════

    GRID_Y    = REF_BOX_Y - 8*mm   # point de départ de la grille (bas de la boîte ref)
    ROW_H     = 14 * mm            # hauteur de chaque ligne de la grille
    COL_W     = CONTENT_W / 2      # largeur de chaque colonne
    COL1_X    = MARGIN
    COL2_X    = MARGIN + COL_W + 4*mm

    # Fond gris clair pour la zone de métadonnées
    GRID_ROWS = 4   # nombre de lignes dans la grille
    draw_rect_filled(
        MARGIN, GRID_Y - GRID_ROWS * ROW_H,
        CONTENT_W, GRID_ROWS * ROW_H,
        fill=LIGHT_BG, stroke=BORDER, radius=6
    )

    # ── Ligne 1 ───────────────────────────────────────────────────────────
    y = GRID_Y - ROW_H + 4*mm
    draw_field(COL1_X + 4*mm, y, "Code facture",  code_unique)
    draw_field(COL2_X,        y, "Date réception",
               date_reception.strftime("%d/%m/%Y") if date_reception else "—")

    # ── Séparateur horizontal ─────────────────────────────────────────────
    y -= ROW_H
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.4)
    c.line(MARGIN + 4*mm, y + ROW_H, MARGIN + CONTENT_W - 4*mm, y + ROW_H)

    # ── Ligne 2 ───────────────────────────────────────────────────────────
    draw_field(COL1_X + 4*mm, y + 4*mm, "Expéditeur",    expediteur)
    draw_field(COL2_X,        y + 4*mm, "N° Courrier",   numero_courrier)

    # ── Séparateur ────────────────────────────────────────────────────────
    y -= ROW_H
    c.line(MARGIN + 4*mm, y + ROW_H, MARGIN + CONTENT_W - 4*mm, y + ROW_H)

    # ── Ligne 3 — Objet (pleine largeur) ──────────────────────────────────
    draw_text(COL1_X + 4*mm, y + 4*mm, "Objet", size=8, color=MUTED)
    # L'objet peut être long : on tronque à 80 caractères pour tenir sur une ligne
    objet_affiche = (objet_courrier or "—")[:80]
    draw_text(COL1_X + 30*mm, y + 4*mm, objet_affiche, size=9, color=DARK)

    # ── Séparateur ────────────────────────────────────────────────────────
    y -= ROW_H
    c.line(MARGIN + 4*mm, y + ROW_H, MARGIN + CONTENT_W - 4*mm, y + ROW_H)

    # ── Ligne 4 ───────────────────────────────────────────────────────────
    draw_field(COL1_X + 4*mm, y + 4*mm, "Date échéance",
               date_echeance.strftime("%d/%m/%Y") if date_echeance else "—")
    draw_field(COL2_X, y + 4*mm, "Date génération",
               date_generation.strftime("%d/%m/%Y %H:%M"))

    # ════════════════════════════════════════════════════════════════════════
    # ZONE DE SIGNATURES
    # ════════════════════════════════════════════════════════════════════════

    SIG_Y = GRID_Y - GRID_ROWS * ROW_H - 28*mm
    SIG_W = (CONTENT_W - 20*mm) / 2    # largeur d'une case de signature
    SIG_H = 22 * mm

    for i, label in enumerate(["L'Instructeur", "Le Superviseur"]):
        sx = MARGIN + i * (SIG_W + 20*mm)

        # Boîte de signature avec fond clair
        draw_rect_filled(sx, SIG_Y, SIG_W, SIG_H, fill=LIGHT_BG, stroke=BORDER, radius=4)

        # Étiquette en haut de la boîte
        draw_centered(sx, SIG_Y + SIG_H - 7*mm, SIG_W,
                      label, font="Helvetica", size=8, color=MUTED)

        # Ligne de signature au bas de la boîte
        c.setStrokeColor(BORDER)
        c.setLineWidth(0.5)
        c.line(sx + 8*mm, SIG_Y + 5*mm, sx + SIG_W - 8*mm, SIG_Y + 5*mm)

    # ════════════════════════════════════════════════════════════════════════
    # PIED DE PAGE
    # ════════════════════════════════════════════════════════════════════════

    FOOTER_Y = 12 * mm

    # Ligne de séparation
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.4)
    c.line(MARGIN, FOOTER_Y + 8*mm, PAGE_W - MARGIN, FOOTER_Y + 8*mm)

    draw_centered(
        0, FOOTER_Y + 3*mm, PAGE_W,
        "Document officiel — ne pas modifier · Généré automatiquement par CFC SUIFACT",
        font="Helvetica", size=7, color=MUTED
    )

    # ── Finalisation ──────────────────────────────────────────────────────────
    c.save()          # écrit le PDF dans le BytesIO
    buf.seek(0)       # remet le curseur au début pour que FastAPI puisse lire
    return buf


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT 1 : POST /generer/{id_facture}
# Génère (et persiste en BD) un ticket EB pour une facture donnée.
# ─────────────────────────────────────────────────────────────────────────────

@router_tickets.post(
    "/generer/{id_facture}",
    status_code=status.HTTP_201_CREATED,
    summary="Générer un ticket EB pour une facture"
)
def generer_ticket(
    id_facture:  int,
    db:          Session      = Depends(get_db),
    utilisateur: Utilisateur  = Depends(verifier_role([
        "INSTRUCTEUR", "ADMINISTRATEUR"
    ]))
):
    """
    Génère un ticket EB unique (format TK-{ANNEE}-{UUID court})
    et le persiste dans la table tickets_eb.
    Un seul ticket peut exister par facture.
    """
    facture = db.query(Facture).filter(
        Facture.idFacture == id_facture
    ).first()

    if not facture:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Facture introuvable")

    if not facture.referenceEB:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Impossible de générer un ticket sans référence EB"
        )

    # Un seul ticket par facture
    existant = db.query(TicketEB).filter(TicketEB.idFacture == id_facture).first()
    if existant:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Un ticket EB existe déjà pour cette facture"
        )

    annee      = datetime.now().year
    code_court = str(uuid_lib.uuid4())[:8].upper()
    code_ticket = f"TK-{annee}-{code_court}"

    ticket = TicketEB(
        codeTicket    = code_ticket,
        referenceEB   = facture.referenceEB,
        idFacture     = id_facture,
        idUtilisateur = utilisateur.idUtilisateur
    )
    db.add(ticket)
    db.flush()

    db.add(Log(
        action        = ActionLogEnum.TICKET_EB_GENERE,
        commentaire   = f"Ticket généré : {code_ticket}",
        idFacture     = id_facture,
        idUtilisateur = utilisateur.idUtilisateur
    ))
    db.commit()

    return {
        "message":     "Ticket EB généré avec succès",
        "codeTicket":  code_ticket,
        "referenceEB": facture.referenceEB
    }


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT 2 : GET /facture/{id_facture}
# Retourne les métadonnées JSON du ticket (utilisé par l'aperçu React).
# ─────────────────────────────────────────────────────────────────────────────

@router_tickets.get(
    "/facture/{id_facture}",
    summary="Obtenir les métadonnées du ticket EB d'une facture"
)
def get_ticket(
    id_facture: int,
    db:         Session     = Depends(get_db),
    _:          Utilisateur = Depends(get_utilisateur_actuel)
):
    """Retourne les champs du ticket EB au format JSON."""
    ticket = db.query(TicketEB).filter(TicketEB.idFacture == id_facture).first()

    if not ticket:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail="Aucun ticket EB pour cette facture"
        )

    return ticket


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT 3 (nouveau) : GET /facture/{id_facture}/pdf
#
# Génère et retourne directement le PDF du ticket EB.
#
# - Réponse de type application/pdf avec Content-Disposition: attachment
#   → le navigateur déclenche un téléchargement ou ouvre l'onglet PDF natif.
# - Accessible à tous les utilisateurs connectés ayant le droit de voir
#   les factures (INSTRUCTEUR et ADMINISTRATEUR, comme pour generer_ticket).
# - Si le ticket n'existe pas encore en BD, on retourne 404.
#   (La création reste séparée via POST /generer/{id_facture}.)
# ─────────────────────────────────────────────────────────────────────────────

@router_tickets.get(
    "/facture/{id_facture}/pdf",
    summary="Télécharger le ticket EB au format PDF",
    response_class=StreamingResponse,
    responses={
        200: {
            "content": {"application/pdf": {}},
            "description": "PDF du ticket EB"
        }
    }
)
def telecharger_ticket_pdf(
    id_facture: int,
    db:         Session     = Depends(get_db),
    _:          Utilisateur = Depends(verifier_role([
        "INSTRUCTEUR", "ADMINISTRATEUR"
    ]))
):
    """
    Génère le PDF du ticket EB côté serveur avec ReportLab et le retourne
    directement dans la réponse HTTP (aucun fichier n'est écrit sur disque).

    Le frontend n'a plus qu'à ouvrir cette URL dans un nouvel onglet ou
    déclencher un <a href="..."> pour lancer le téléchargement.
    """

    # ── 1. Charger le ticket et la facture associée ───────────────────────────
    ticket = db.query(TicketEB).filter(TicketEB.idFacture == id_facture).first()

    if not ticket:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail="Aucun ticket EB pour cette facture. Générez-le d'abord."
        )

    # On charge la facture avec ses courriers (joinedload évite le N+1)
    facture = db.query(Facture).options(
        joinedload(Facture.courriers)
    ).filter(Facture.idFacture == id_facture).first()

    if not facture:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Facture introuvable")

    # Premier courrier associé (référence d'affichage dans le ticket)
    courrier = facture.courriers[0] if facture.courriers else None

    # ── 2. Construire le PDF en mémoire ───────────────────────────────────────
    pdf_buffer = _build_ticket_pdf(
        code_ticket     = ticket.codeTicket,
        reference_eb    = facture.referenceEB or "—",
        code_unique     = facture.codeUnique,
        date_reception  = facture.dateReception,
        date_echeance   = facture.dateEcheance,
        expediteur      = courrier.expediteur      if courrier else None,
        numero_courrier = courrier.numero_courrier if courrier else None,
        objet_courrier  = courrier.objet_courrier  if courrier else None,
        date_generation = ticket.dateGeneration or datetime.now(),
    )

    # ── 3. Nom de fichier propre pour le téléchargement ───────────────────────
    # Exemple : ticket-EB-TK-2026-AB12CD34.pdf
    filename = f"ticket-EB-{ticket.codeTicket}.pdf"

    # ── 4. Retourner le PDF en streaming ─────────────────────────────────────
    # StreamingResponse lit le BytesIO chunk par chunk sans le charger
    # entièrement en mémoire, ce qui est efficace même pour de gros PDFs.
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={
            # "inline" = le navigateur ouvre le PDF dans un onglet
            # Remplacer par "attachment" pour forcer le téléchargement
            "Content-Disposition": f'inline; filename="{filename}"'
        }
    )
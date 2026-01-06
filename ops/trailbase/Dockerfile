FROM trailbase/trailbase:latest

# Bundle repo-managed config + migrations into the image.
# These are copied into the persistent depot volume at runtime by entrypoint.sh.
COPY ops/trailbase/traildepot /opt/readest-traildepot
COPY ops/trailbase/entrypoint.sh /entrypoint.sh

USER 0
RUN chmod 755 /entrypoint.sh
USER trailbase

ENTRYPOINT ["/entrypoint.sh"]
CMD ["/app/trail", "run"]

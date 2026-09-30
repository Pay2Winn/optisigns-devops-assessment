output "application_namespace" {
  value = kubernetes_namespace_v1.app.metadata[0].name
}

output "postgres_storage_class" {
  value = kubernetes_storage_class_v1.postgres.metadata[0].name
}

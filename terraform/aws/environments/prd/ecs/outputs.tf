output "alb_dns_name" {
  description = "ALB DNS name"
  value       = aws_lb.app.dns_name
}

output "cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.this.name
}

output "backend_service_name" {
  description = "ECS backend service name"
  value       = aws_ecs_service.backend.name
}

output "celery_service_name" {
  description = "ECS Celery worker service name"
  value       = aws_ecs_service.celery.name
}

output "celery_beat_service_name" {
  description = "ECS Celery Beat service name"
  value       = aws_ecs_service.celery_beat.name
}

output "frontend_service_name" {
  description = "ECS frontend service name"
  value       = aws_ecs_service.frontend.name
}
